// Gig contracts: generated at funding as an immutable snapshot, hashed for
// tamper evidence, and signed by both parties with an audit trail.

import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST as fundBooking } from "@/app/api/v1/bookings/[id]/fund/route";
import { GET as getContractRoute } from "@/app/api/v1/bookings/[id]/contract/route";
import { POST as signContractRoute } from "@/app/api/v1/bookings/[id]/contract/sign/route";
import { prisma } from "@/server/db";
import {
  ctxFor,
  createBookingFixture,
  json,
  makeReq,
  registerAdmin,
  registerUser,
  type BookingFixture,
} from "./helpers/app";

const getContract = (id: string, cookie: string) =>
  getContractRoute(makeReq(`/bookings/${id}/contract`, { cookie }), ctxFor(id));

const signContract = (id: string, cookie: string, body: Record<string, unknown>) =>
  signContractRoute(
    makeReq(`/bookings/${id}/contract/sign`, { method: "POST", cookie, body }),
    ctxFor(id),
  );

const fund = (id: string, cookie: string) =>
  fundBooking(makeReq(`/bookings/${id}/fund`, { method: "POST", cookie }), ctxFor(id));

/** Funds the escrow (mock provider → instant FUNDED + contract generation). */
async function fundedFixture(rateCents = 30000): Promise<BookingFixture> {
  const fx = await createBookingFixture(rateCents);
  const res = await fund(fx.bookingId, fx.client.cookie);
  if (res.status !== 200) throw new Error(`fixture fund failed: ${res.status}`);
  return fx;
}

type ContractBody = {
  id: string;
  status: string;
  title: string;
  terms: string;
  contentHash: string;
  totalCents: number;
  feeCents: number;
  payoutCents: number;
  signatures: Array<{ role: string; signatureName: string; signedAt: string }>;
  canSign: boolean;
  signedByMe: boolean;
  clientName: string;
  musicianName: string;
};

describe("contract generation", () => {
  it("is unavailable before the escrow is funded", async () => {
    const fx = await createBookingFixture();
    const res = await getContract(fx.bookingId, fx.client.cookie);
    expect(res.status).toBe(409);
    expect((await json(res)).error).toContain("funded");
  });

  it("snapshots the deal, terms and content hash on first read after funding", async () => {
    const fx = await fundedFixture(600_00);
    const res = await getContract(fx.bookingId, fx.client.cookie);
    expect(res.status).toBe(200);
    const contract = (await json(res)) as unknown as ContractBody;

    expect(contract.status).toBe("AWAITING_SIGNATURES");
    expect(contract.signatures).toHaveLength(0);
    expect(contract.canSign).toBe(true);
    expect(contract.signedByMe).toBe(false);

    // Snapshot fields reflect the booking economics.
    expect(contract.totalCents).toBe(600_00);
    expect(contract.feeCents).toBe(90_00); // 15% commission
    expect(contract.payoutCents).toBe(510_00);
    expect(contract.clientName).toBe(fx.client.name);
    expect(contract.musicianName).toBe(fx.musician.name);

    // Terms are a canonical document referencing both parties and the gig.
    expect(contract.terms).toContain("GIG PERFORMANCE AGREEMENT");
    expect(contract.terms).toContain("Fixture gig for payment tests");
    expect(contract.terms).toContain(fx.client.name);
    expect(contract.terms).toContain(fx.musician.name);

    // Tamper evidence: hash matches the terms exactly.
    const recomputed = createHash("sha256").update(contract.terms, "utf8").digest("hex");
    expect(contract.contentHash).toBe(recomputed);
  });

  it("is generated idempotently (same contract across reads, both parties see it)", async () => {
    const fx = await fundedFixture();
    const first = (await json(await getContract(fx.bookingId, fx.client.cookie))) as unknown as ContractBody;
    const again = (await json(await getContract(fx.bookingId, fx.client.cookie))) as unknown as ContractBody;
    expect(again.id).toBe(first.id);

    // The musician sees the same single contract.
    const asMusician = (await json(
      await getContract(fx.bookingId, fx.musician.cookie),
    )) as unknown as ContractBody;
    expect(asMusician.id).toBe(first.id);
    expect(asMusician.canSign).toBe(true);

    const rows = await prisma.contract.findMany({ where: { bookingId: fx.bookingId } });
    expect(rows).toHaveLength(1);
  });

  it("notifies both parties that the contract is ready to sign", async () => {
    const fx = await fundedFixture();
    const notes = await prisma.notification.findMany({
      where: {
        type: "CONTRACT_READY",
        userId: { in: [fx.client.id, fx.musician.id] },
      },
    });
    expect(notes).toHaveLength(2);
  });
});

describe("contract signing", () => {
  it("requires both signatures before the contract is fully signed", async () => {
    const fx = await fundedFixture();

    // Client signs first.
    const clientSign = await signContract(fx.bookingId, fx.client.cookie, {
      signatureName: fx.client.name,
    });
    expect(clientSign.status).toBe(200);
    const afterClient = (await json(clientSign)) as unknown as ContractBody;
    expect(afterClient.status).toBe("AWAITING_SIGNATURES");
    expect(afterClient.signatures).toHaveLength(1);
    expect(afterClient.signedByMe).toBe(true);
    expect(afterClient.canSign).toBe(false);

    // Musician countersigns → fully executed.
    const musicianSign = await signContract(fx.bookingId, fx.musician.cookie, {
      signatureName: fx.musician.name,
    });
    expect(musicianSign.status).toBe(200);
    const final = (await json(musicianSign)) as unknown as ContractBody;
    expect(final.status).toBe("SIGNED");
    expect(final.signatures).toHaveLength(2);
    expect(final.signatures.map((s) => s.role).sort()).toEqual(["CLIENT", "MUSICIAN"]);

    // Both parties are notified of full execution. (The musician also got the
    // interim "awaiting your signature" ping after the client signed first.)
    const notes = await prisma.notification.findMany({
      where: {
        type: "CONTRACT_SIGNED",
        userId: { in: [fx.client.id, fx.musician.id] },
      },
    });
    const fullySigned = notes.filter((n) => n.title.includes("both parties"));
    expect(fullySigned).toHaveLength(2);
    expect(new Set(fullySigned.map((n) => n.userId))).toEqual(
      new Set([fx.client.id, fx.musician.id]),
    );
  });

  it("records an audit trail (role, IP, user agent) with each signature", async () => {
    const fx = await fundedFixture();
    const req = new NextRequest(
      `http://localhost:3000/api/v1/bookings/${fx.bookingId}/contract/sign`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: fx.client.cookie,
          "x-forwarded-for": "203.0.113.9, 10.0.0.1",
          "user-agent": "ContractSigner/1.0",
        },
        body: JSON.stringify({ signatureName: "M. Testimus" }),
      },
    );
    const res = await signContractRoute(req, ctxFor(fx.bookingId));
    expect(res.status).toBe(200);

    const row = await prisma.contractSignature.findFirst({
      where: { userId: fx.client.id },
    });
    expect(row?.role).toBe("CLIENT");
    expect(row?.signatureName).toBe("M. Testimus");
    expect(row?.ipAddress).toBe("203.0.113.9"); // first hop only
    expect(row?.userAgent).toBe("ContractSigner/1.0");
  });

  it("notifies the other party after a single signature", async () => {
    const fx = await fundedFixture();
    await signContract(fx.bookingId, fx.client.cookie, { signatureName: fx.client.name });
    const notes = await prisma.notification.findMany({
      where: { type: "CONTRACT_SIGNED", userId: fx.musician.id },
    });
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toContain("awaiting your signature");
  });

  it("guards signing: validation, double-sign, permissions", async () => {
    const fx = await fundedFixture();

    // Empty / too-short signature names are rejected.
    expect((await signContract(fx.bookingId, fx.client.cookie, { signatureName: "" })).status).toBe(400);
    expect(
      (await signContract(fx.bookingId, fx.client.cookie, { signatureName: "x" })).status,
    ).toBe(400);

    // A non-party can neither read nor sign.
    const stranger = await registerUser("CLIENT");
    expect((await getContract(fx.bookingId, stranger.cookie)).status).toBe(403);
    expect(
      (await signContract(fx.bookingId, stranger.cookie, { signatureName: "Stranger Danger" })).status,
    ).toBe(403);

    // Admins can view but never sign.
    const admin = await registerAdmin();
    const adminView = await getContract(fx.bookingId, admin.cookie);
    expect(adminView.status).toBe(200);
    expect(((await json(adminView)) as unknown as ContractBody).canSign).toBe(false);
    expect(
      (await signContract(fx.bookingId, admin.cookie, { signatureName: "The Admin" })).status,
    ).toBe(403);

    // Signing once is fine; signing again is a conflict.
    expect((await signContract(fx.bookingId, fx.client.cookie, { signatureName: fx.client.name })).status).toBe(200);
    expect(
      (await signContract(fx.bookingId, fx.client.cookie, { signatureName: fx.client.name })).status,
    ).toBe(409);

    // Once fully signed, nobody can sign again.
    await signContract(fx.bookingId, fx.musician.cookie, { signatureName: fx.musician.name });
    const thirdParty = await registerUser("MUSICIAN");
    expect(
      (await signContract(fx.bookingId, thirdParty.cookie, { signatureName: "Nope" })).status,
    ).toBe(403); // non-party check fires before the status check
  });
});
