// Gig performance agreements: generated when escrow is funded, signed by both
// parties in-app, with a SHA-256 content hash as tamper evidence.
//
// The contract body is an immutable snapshot of the deal (gig + split at
// funding time) — later gig/profile edits or commission changes never rewrite
// an existing agreement.

import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { conflict, forbidden, notFound } from "@/server/errors";
import type { SessionUser } from "@/server/auth/session";
import { notify } from "./notification-service";
import { formatMoney } from "@/lib/format";
import type { ContractDTO, ContractSignatureDTO } from "@/lib/types";

/** Booking statuses after which a contract can exist. */
const GENERATABLE = ["FUNDED", "IN_PROGRESS", "COMPLETED", "DISPUTED", "REFUNDED"];

function formatDate(utcDate: Date): string {
  return utcDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Canonical plain-text agreement — this exact string is hashed. */
function buildTerms(b: {
  bookingId: string;
  title: string;
  eventDate: Date;
  location: string;
  venueName: string | null;
  clientName: string;
  musicianName: string;
  totalCents: number;
  feeCents: number;
  feeRate: number;
  payoutCents: number;
}): string {
  const venue = b.venueName ? ` at ${b.venueName}` : "";
  return `GIG PERFORMANCE AGREEMENT
Booking reference: ${b.bookingId}

BETWEEN
  Client:   ${b.clientName}
  Musician: ${b.musicianName}

1. ENGAGEMENT
The Musician agrees to perform at "${b.title}" on ${formatDate(b.eventDate)} in ${b.location}${venue}.

2. FEE AND PAYMENT
The Client shall pay ${formatMoney(b.totalCents)} into Gigify escrow. The platform
service fee is ${formatMoney(b.feeCents)} (${Math.round(b.feeRate * 1000) / 10}% of the total), and the
Musician receives ${formatMoney(b.payoutCents)} upon the Client's confirmation that the
gig was completed as agreed.

3. ESCROW
Funds are held by Gigify until completion. The Musician will not be paid
until the Client confirms completion; the Client cannot withdraw the funds
after the gig has started without opening a dispute.

4. CANCELLATION AND DISPUTES
Either party may cancel before escrow funding, with no charge. After funding,
cancellation requests and disputes are mediated by Gigify under its dispute
policy; outcomes are a full release to the Musician or a full refund to the
Client.

5. AGREEMENT
By signing electronically in the Gigify app, both parties agree to the terms
above. This document is a snapshot of the deal at funding time; its SHA-256
content hash is recorded alongside the contract.
`;
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function toContractDTO(
  contract: ContractFull,
  user: SessionUser,
): ContractDTO {
  const signatures: ContractSignatureDTO[] = contract.signatures
    .slice()
    .sort((a, b) => a.signedAt.getTime() - b.signedAt.getTime())
    .map((s) => ({
      role: s.role,
      signatureName: s.signatureName,
      signedAt: s.signedAt.toISOString(),
    }));
  const isParty =
    user.role === "ADMIN" ||
    contract.booking.clientId === user.id ||
    contract.booking.musicianId === user.id;
  const signedByMe = contract.signatures.some((s) => s.userId === user.id);
  return {
    id: contract.id,
    bookingId: contract.bookingId,
    status: contract.status,
    title: contract.title,
    eventDate: contract.eventDate.toISOString(),
    location: contract.location,
    venueName: contract.venueName,
    clientName: contract.clientName,
    musicianName: contract.musicianName,
    totalCents: contract.totalCents,
    feeCents: contract.feeCents,
    feeRate: contract.feeRate,
    payoutCents: contract.payoutCents,
    terms: contract.terms,
    contentHash: contract.contentHash,
    createdAt: contract.createdAt.toISOString(),
    signatures,
    canSign:
      isParty &&
      user.role !== "ADMIN" &&
      contract.status === "AWAITING_SIGNATURES" &&
      !signedByMe,
    signedByMe,
  };
}

const CONTRACT_INCLUDE = {
  signatures: true,
  booking: { select: { clientId: true, musicianId: true, gig: { select: { title: true } } } },
} satisfies Prisma.ContractInclude;

type ContractFull = Prisma.ContractGetPayload<{ include: typeof CONTRACT_INCLUDE }>;

/**
 * Creates the contract for a funded booking if it does not exist yet.
 * Non-throwing variant for call sites where the booking action already
 * succeeded (funding, webhooks) — the contract stays lazily creatable via GET.
 */
export async function tryEnsureContract(bookingId: string): Promise<void> {
  try {
    await ensureContract(bookingId);
  } catch (err) {
    console.error("[contract] generation failed:", err instanceof Error ? err.message : err);
  }
}

/** Idempotently creates (or returns) the contract for a funded booking. */
export async function ensureContract(bookingId: string): Promise<ContractFull> {
  const existing = await prisma.contract.findUnique({
    where: { bookingId },
    include: CONTRACT_INCLUDE,
  });
  if (existing) return existing;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      gig: { select: { title: true, eventDate: true, location: true, venueName: true } },
      client: { select: { name: true } },
      musician: { select: { name: true } },
    },
  });
  if (!booking) throw notFound("Booking not found.");
  if (!GENERATABLE.includes(booking.status)) {
    throw conflict("The contract becomes available once the escrow is funded.");
  }

  const snapshot = {
    bookingId: booking.id,
    title: booking.gig.title,
    eventDate: booking.gig.eventDate,
    location: booking.gig.location,
    venueName: booking.gig.venueName,
    clientName: booking.client.name,
    musicianName: booking.musician.name,
    totalCents: booking.totalCents,
    feeCents: booking.platformFeeCents,
    feeRate: booking.platformFeeRate,
    payoutCents: booking.musicianPayoutCents,
  };
  const terms = buildTerms(snapshot);
  const contentHash = sha256(terms);

  try {
    const created = await prisma.contract.create({
      // snapshot.bookingId === bookingId (same row), so the spread is safe.
      data: { status: "AWAITING_SIGNATURES", terms, contentHash, ...snapshot },
      include: CONTRACT_INCLUDE,
    });
    await notify({
      userId: booking.clientId,
      type: "CONTRACT_READY",
      title: "Your gig contract is ready to sign",
      body: `The agreement for “${booking.gig.title}” has been generated from the funded booking. Review and sign it to make it official.`,
      link: `/bookings/${booking.id}/contract`,
    });
    await notify({
      userId: booking.musicianId,
      type: "CONTRACT_READY",
      title: "Your gig contract is ready to sign",
      body: `The agreement for “${booking.gig.title}” has been generated from the funded booking. Review and sign it to make it official.`,
      link: `/bookings/${booking.id}/contract`,
    });
    return created;
  } catch (err) {
    // Unique-bookingId race: someone else created it between read and write.
    if ((err as { code?: string }).code === "P2002") {
      const raced = await prisma.contract.findUnique({ where: { bookingId }, include: CONTRACT_INCLUDE });
      if (raced) return raced;
    }
    throw err;
  }
}

async function loadBookingForContract(id: string, user: SessionUser) {
  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) throw notFound("Booking not found.");
  const isParty = booking.clientId === user.id || booking.musicianId === user.id;
  if (!isParty && user.role !== "ADMIN") throw forbidden();
  return booking;
}

export async function getContractForBooking(user: SessionUser, bookingId: string): Promise<ContractDTO> {
  const booking = await loadBookingForContract(bookingId, user);
  const contract = await ensureContract(booking.id);
  return toContractDTO(contract, user);
}

export async function signContract(
  user: SessionUser,
  bookingId: string,
  input: { signatureName: string; ip?: string | null; userAgent?: string | null },
): Promise<ContractDTO> {
  const booking = await loadBookingForContract(bookingId, user);
  if (user.role === "ADMIN") {
    throw forbidden("Contracts are signed by the client and musician only.");
  }

  const contract = await ensureContract(booking.id);
  if (contract.status !== "AWAITING_SIGNATURES") {
    throw conflict("This contract has already been fully signed.");
  }
  if (contract.signatures.some((s) => s.userId === user.id)) {
    throw conflict("You have already signed this contract.");
  }

  const role = booking.clientId === user.id ? "CLIENT" : "MUSICIAN";
  await prisma.contractSignature.create({
    data: {
      contractId: contract.id,
      userId: user.id,
      role,
      signatureName: input.signatureName.trim(),
      ipAddress: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    },
  });

  const refreshed = (await prisma.contract.findUnique({
    where: { id: contract.id },
    include: CONTRACT_INCLUDE,
  }))!;
  const fullySigned = refreshed.signatures.length >= 2;
  if (fullySigned) {
    await prisma.contract.update({
      where: { id: contract.id },
      data: { status: "SIGNED" },
    });
    refreshed.status = "SIGNED";
  }

  const gigTitle = refreshed.booking.gig.title;
  if (fullySigned) {
    for (const userId of [booking.clientId, booking.musicianId]) {
      await notify({
        userId,
        type: "CONTRACT_SIGNED",
        title: "Contract signed by both parties 🤝",
        body: `The agreement for “${gigTitle}” is now fully signed. Show up, play great, get paid.`,
        link: `/bookings/${booking.id}/contract`,
      });
    }
  } else {
    const otherId = role === "CLIENT" ? booking.musicianId : booking.clientId;
    await notify({
      userId: otherId,
      type: "CONTRACT_SIGNED",
      title: "Contract signed — awaiting your signature",
      body: `${user.name} signed the agreement for “${gigTitle}”. Review and sign to make it fully executed.`,
      link: `/bookings/${booking.id}/contract`,
    });
  }

  const final = (await prisma.contract.findUnique({
    where: { id: contract.id },
    include: CONTRACT_INCLUDE,
  }))!;
  return toContractDTO(final, user);
}
