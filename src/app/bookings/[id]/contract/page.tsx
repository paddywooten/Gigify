"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import Protected from "@/components/Protected";
import { LoadingBlock } from "@/components/Spinner";
import {
  Badge,
  ErrorBanner,
  Field,
  PageHeader,
  SuccessBanner,
  TextInput,
} from "@/components/ui";
import { formatDateTime, formatMoney, formatRate } from "@/lib/format";
import type { ContractDTO, ContractSignatureDTO } from "@/lib/types";

function SignatureBlock({
  role,
  signature,
}: {
  role: "CLIENT" | "MUSICIAN";
  signature?: ContractSignatureDTO;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {role === "CLIENT" ? "Client" : "Musician"}
      </p>
      {signature ? (
        <>
          <p className="mt-2 font-serif text-lg italic text-slate-900">
            {signature.signatureName}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Signed electronically · {formatDateTime(signature.signedAt)}
          </p>
        </>
      ) : (
        <p className="mt-3 text-sm italic text-slate-400">Pending signature…</p>
      )}
    </div>
  );
}

export default function ContractPage() {
  const params = useParams<{ id: string }>();
  const bookingId = params.id;
  const { user } = useAuth();
  const [contract, setContract] = useState<ContractDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signatureName, setSignatureName] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setContract(await api<ContractDTO>(`/bookings/${bookingId}/contract`));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [bookingId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (user && signatureName === null) setSignatureName(user.name);
  }, [user, signatureName]);

  async function sign() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await api<ContractDTO>(`/bookings/${bookingId}/contract/sign`, {
        method: "POST",
        body: { signatureName },
      });
      setContract(updated);
      setNotice(
        updated.status === "SIGNED"
          ? "Contract signed by both parties — it is now fully executed 🤝"
          : "Signed. We've notified the other party to countersign.",
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!contract && !error) return <LoadingBlock />;
  if (!contract) {
    return (
      <Protected>
        <ErrorBanner message={error} />
        <p className="mt-4">
          <Link href={`/bookings/${bookingId}`} className="text-brand-600 hover:underline">
            ← Back to booking
          </Link>
        </p>
      </Protected>
    );
  }

  const sigFor = (role: "CLIENT" | "MUSICIAN") =>
    contract.signatures.find((s) => s.role === role);
  const signed = contract.status === "SIGNED";

  return (
    <Protected>
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="print:hidden">
          <PageHeader
            title="Gig Performance Agreement"
            subtitle={`Booking #${contract.bookingId.slice(-8)} · generated ${formatDateTime(contract.createdAt)}`}
            action={
              <div className="flex items-center gap-3">
                <Badge color={signed ? "green" : "amber"}>
                  {signed ? "Fully signed ✓" : `Awaiting signatures (${contract.signatures.length}/2)`}
                </Badge>
                <button type="button" onClick={() => window.print()} className="btn-secondary">
                  Print / Save PDF
                </button>
              </div>
            }
          />
          <ErrorBanner message={error} />
          <SuccessBanner message={notice} />
        </div>

        {/* Agreement document */}
        <article className="card p-8">
          <h2 className="text-lg font-bold text-slate-900">
            {contract.title}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {formatDateTime(contract.eventDate)} · {contract.location}
            {contract.venueName ? ` · ${contract.venueName}` : ""}
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <SignatureBlock role="CLIENT" signature={sigFor("CLIENT")} />
            <SignatureBlock role="MUSICIAN" signature={sigFor("MUSICIAN")} />
          </div>

          <dl className="mt-6 space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
              <dt className="text-slate-600">Agreed fee (client funds escrow)</dt>
              <dd className="font-semibold">{formatMoney(contract.totalCents)}</dd>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-brand-50 px-4 py-3">
              <dt className="text-brand-800">Gigify service fee ({formatRate(contract.feeRate)})</dt>
              <dd className="font-semibold text-brand-800">− {formatMoney(contract.feeCents)}</dd>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-4 py-3">
              <dt className="text-emerald-800">Musician receives on completion</dt>
              <dd className="font-semibold text-emerald-800">{formatMoney(contract.payoutCents)}</dd>
            </div>
          </dl>

          <pre className="mt-6 whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-5 font-mono text-[13px] leading-relaxed text-slate-700">
{contract.terms}
          </pre>

          <p className="mt-4 break-all rounded bg-slate-50 p-3 font-mono text-[11px] text-slate-500">
            SHA-256 content hash: {contract.contentHash}
          </p>
        </article>

        {/* Signing */}
        <div className="card p-6 print:hidden">
          {signed ? (
            <p className="text-sm text-emerald-700">
              ✓ This contract is fully executed by both parties.
            </p>
          ) : contract.signedByMe ? (
            <p className="text-sm text-slate-600">
              You&apos;ve signed this contract. Waiting for the other party to countersign (
              {contract.signatures.length}/2).
            </p>
          ) : contract.canSign ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void sign();
              }}
              className="space-y-4"
            >
              <Field
                label="Type your name as your electronic signature"
                hint="By signing you agree to the terms of this agreement."
              >
                <TextInput
                  value={signatureName ?? ""}
                  onChange={(e) => setSignatureName(e.target.value)}
                  placeholder="Your full name"
                  maxLength={120}
                  required
                />
              </Field>
              <button type="submit" disabled={busy} className="btn-primary">
                {busy ? "Signing…" : "Sign contract"}
              </button>
            </form>
          ) : (
            <p className="text-sm text-slate-500">
              Only the client and musician can sign this contract.
            </p>
          )}
          <p className="mt-4 text-xs text-slate-400">
            <Link href={`/bookings/${bookingId}`} className="hover:text-brand-600">
              ← Back to booking
            </Link>
          </p>
        </div>
      </div>
    </Protected>
  );
}
