"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import Protected from "@/components/Protected";
import { BOOKING_STATUS_LABELS } from "@/lib/constants";
import { formatRate } from "@/lib/format";
import type { BookingDTO, ContractDTO } from "@/lib/types";
import { formatDateTime, formatMoney } from "@/lib/format";
import { LoadingBlock } from "@/components/Spinner";
import {
  ErrorBanner,
  Field,
  PageHeader,
  StatusBadge,
  SuccessBanner,
  TextArea,
} from "@/components/ui";
import StarRating from "@/components/StarRating";

const STEPS = ["PENDING_FUNDING", "FUNDED", "IN_PROGRESS", "COMPLETED"] as const;

function Timeline({ status }: { status: string }) {
  if (status === "CANCELLED" || status === "REFUNDED" || status === "DISPUTED") {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        Booking ended as <StatusBadge status={status} label={BOOKING_STATUS_LABELS[status]} />
      </div>
    );
  }
  const currentIdx = STEPS.indexOf(status as (typeof STEPS)[number]);
  return (
    <ol className="flex items-center gap-2">
      {STEPS.map((step, i) => (
        <li key={step} className="flex flex-1 items-center gap-2">
          <span
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
              i < currentIdx
                ? "bg-emerald-500 text-white"
                : i === currentIdx
                  ? "bg-brand-600 text-white"
                  : "bg-slate-200 text-slate-500"
            }`}
          >
            {i < currentIdx ? "✓" : i + 1}
          </span>
          <span
            className={`hidden text-xs sm:block ${
              i === currentIdx ? "font-semibold text-slate-900" : "text-slate-500"
            }`}
          >
            {BOOKING_STATUS_LABELS[step]}
          </span>
          {i < STEPS.length - 1 && <span className="h-px flex-1 bg-slate-200" />}
        </li>
      ))}
    </ol>
  );
}

function ReviewForm({ bookingId, onDone }: { bookingId: string; onDone: () => void }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/bookings/${bookingId}/reviews`, { method: "POST", body: { rating, comment } });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <ErrorBanner message={error} />
      <Field label="Your rating">
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              className={`text-2xl ${n <= rating ? "text-amber-400" : "text-slate-300"}`}
              aria-label={`${n} stars`}
            >
              ★
            </button>
          ))}
        </div>
      </Field>
      <Field label="Review">
        <TextArea
          required
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="How did the gig go?"
        />
      </Field>
      <button type="submit" disabled={busy} className="btn-primary">
        {busy ? "Submitting…" : "Submit review"}
      </button>
    </form>
  );
}

/** Entry point to the contract: shown once the escrow is funded. */
function ContractBanner({ bookingId }: { bookingId: string }) {
  const [contract, setContract] = useState<ContractDTO | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    api<ContractDTO>(`/bookings/${bookingId}/contract`)
      .then(setContract)
      .catch(() => setMissing(true));
  }, [bookingId]);

  if (missing || !contract) return null;
  const signed = contract.status === "SIGNED";
  return (
    <div className="card flex flex-wrap items-center justify-between gap-3 p-4 print:hidden">
      <div className="flex items-center gap-3">
        <span className="text-2xl">📜</span>
        <div>
          <p className="text-sm font-semibold text-slate-900">
            Gig contract {signed ? "— fully signed ✓" : `— ${contract.signatures.length}/2 signatures`}
          </p>
          <p className="text-xs text-slate-500">
            {signed
              ? "Both parties have executed the agreement."
              : contract.signedByMe
                ? "You've signed — waiting for the other party."
                : "Your signature is required."}
          </p>
        </div>
      </div>
      <Link href={`/bookings/${bookingId}/contract`} className="btn-primary">
        {signed ? "View contract" : "Review & sign"}
      </Link>
    </div>
  );
}

function BookingDetail({ booking, reload }: { booking: BookingDTO; reload: () => Promise<void> }) {  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [showDispute, setShowDispute] = useState(false);

  const isClient = user?.id === booking.client.id;
  const isMusician = user?.id === booking.musician.id;
  const isAdmin = user?.role === "ADMIN";
  const myReview = booking.reviews?.find((r) => r.reviewer.id === user?.id);

  async function act(action: string, reason?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api(`/bookings/${booking.id}/action`, { method: "POST", body: { action, reason } });
      setNotice(
        action === "FUND"
          ? "Funds secured in escrow."
          : action === "COMPLETE"
            ? "Booking completed — the musician has been paid."
            : `${action.toLowerCase()} processed.`,
      );
      await reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function fund() {
    setBusy(true);
    setError(null);
    try {
      await api(`/bookings/${booking.id}/fund`, { method: "POST" });
      setNotice("Funds secured in escrow. The musician has been notified.");
      await reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function resolve(outcome: "MUSICIAN_PAYOUT" | "CLIENT_REFUND") {
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/bookings/${booking.id}/resolve`, { method: "POST", body: { outcome } });
      setNotice("Dispute resolved.");
      await reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      {/* Status + timeline */}
      <div className="card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <StatusBadge status={booking.status} label={BOOKING_STATUS_LABELS[booking.status]} />
          <p className="text-sm text-slate-500">Booking #{booking.id.slice(-8)}</p>
        </div>
        <Timeline status={booking.status} />
        {booking.disputeReason && booking.status === "DISPUTED" && (
          <p className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
            Dispute reason: {booking.disputeReason}
          </p>
        )}
      </div>

      {/* Contract entry point (exists once the escrow is funded) */}
      {["FUNDED", "IN_PROGRESS", "COMPLETED", "DISPUTED"].includes(booking.status) && (
        <ContractBanner bookingId={booking.id} />
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Money */}
        <div className="card p-6 lg:col-span-2">
          <h2 className="font-semibold text-slate-900">Payment breakdown</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
              <dt className="text-slate-600">Gig total (client funds escrow)</dt>
              <dd className="font-semibold">{formatMoney(booking.totalCents)}</dd>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-brand-50 px-4 py-3">
              <dt className="text-brand-800">
                Platform commission ({formatRate(booking.platformFeeRate)})
              </dt>
              <dd className="font-semibold text-brand-800">− {formatMoney(booking.platformFeeCents)}</dd>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-4 py-3">
              <dt className="text-emerald-800">Musician receives on completion</dt>
              <dd className="font-semibold text-emerald-800">{formatMoney(booking.musicianPayoutCents)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-slate-400">
            The commission rate was locked in when this booking was created.
          </p>

          {booking.payments && booking.payments.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-slate-900">Payment history</h3>
              <ul className="mt-2 divide-y divide-slate-100 text-sm">
                {booking.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2">
                    <div>
                      <p className="font-medium text-slate-700">
                        {p.type.replaceAll("_", " ").toLowerCase()} · {p.provider}
                      </p>
                      <p className="text-xs text-slate-400">
                        {formatDateTime(p.createdAt)} · ref {p.providerRef}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{formatMoney(p.amountCents)}</p>
                      <p className={`text-xs ${p.status === "SUCCEEDED" ? "text-emerald-600" : "text-rose-600"}`}>
                        {p.status.toLowerCase()}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Actions */}
        <aside className="card h-fit p-6">
          <h2 className="font-semibold text-slate-900">Actions</h2>
          <div className="mt-4 space-y-3">
            {isClient && booking.status === "PENDING_FUNDING" && (
              <>
                <p className="text-sm text-slate-600">
                  Secure your musician by funding the escrow. Funds are only released when you confirm
                  the gig is complete.
                </p>
                <button onClick={fund} disabled={busy} className="btn-primary w-full">
                  Fund {formatMoney(booking.totalCents)} escrow
                </button>
                <button onClick={() => act("CANCEL")} disabled={busy} className="btn-secondary w-full">
                  Cancel booking
                </button>
              </>
            )}

            {isMusician && booking.status === "PENDING_FUNDING" && (
              <>
                <p className="text-sm text-slate-600">
                  Waiting for {booking.client.name} to fund the escrow. You&apos;ll be notified as soon as
                  the funds are secured.
                </p>
                <button onClick={() => act("CANCEL")} disabled={busy} className="btn-secondary w-full">
                  Cancel booking
                </button>
              </>
            )}

            {isMusician && booking.status === "FUNDED" && (
              <>
                <p className="text-sm text-slate-600">
                  Escrow is funded — {formatMoney(booking.musicianPayoutCents)} is reserved for you. Mark the
                  gig as started when you begin.
                </p>
                <button onClick={() => act("START")} disabled={busy} className="btn-primary w-full">
                  Start the gig
                </button>
              </>
            )}

            {isMusician && booking.status === "IN_PROGRESS" && (
              <p className="text-sm text-slate-600">
                Gig in progress. Once {booking.client.name} confirms completion, {formatMoney(booking.musicianPayoutCents)}{" "}
                is paid out to you.
              </p>
            )}

            {isClient && booking.status === "IN_PROGRESS" && (
              <>
                <p className="text-sm text-slate-600">
                  Confirm the gig went ahead to release {formatMoney(booking.musicianPayoutCents)} to the musician.
                </p>
                <button onClick={() => act("COMPLETE")} disabled={busy} className="btn-primary w-full">
                  Confirm completion & pay
                </button>
              </>
            )}

            {(isClient || isMusician) && ["FUNDED", "IN_PROGRESS"].includes(booking.status) && (
              <>
                <hr className="my-2" />
                {showDispute ? (
                  <div className="space-y-2">
                    <Field label="What went wrong?">
                      <TextArea
                        rows={3}
                        value={disputeReason}
                        onChange={(e) => setDisputeReason(e.target.value)}
                        placeholder="Describe the problem for the platform team…"
                      />
                    </Field>
                    <button
                      onClick={() => act("DISPUTE", disputeReason)}
                      disabled={busy || !disputeReason.trim()}
                      className="btn-danger w-full"
                    >
                      Submit dispute
                    </button>
                    <button onClick={() => setShowDispute(false)} className="btn-secondary w-full">
                      Never mind
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setShowDispute(true)} className="btn-secondary w-full">
                    Open a dispute
                  </button>
                )}
              </>
            )}

            {isAdmin && booking.status === "DISPUTED" && (
              <div className="space-y-2">
                <p className="text-sm text-slate-600">Resolve this dispute as the platform.</p>
                <button
                  onClick={() => resolve("MUSICIAN_PAYOUT")}
                  disabled={busy}
                  className="btn-primary w-full"
                >
                  Release to musician
                </button>
                <button
                  onClick={() => resolve("CLIENT_REFUND")}
                  disabled={busy}
                  className="btn-secondary w-full"
                >
                  Refund client
                </button>
              </div>
            )}

            {["COMPLETED", "REFUNDED", "CANCELLED"].includes(booking.status) && (
              <p className="text-sm text-slate-500">This booking is closed.</p>
            )}
          </div>
        </aside>
      </div>

      {/* Reviews */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <h2 className="font-semibold text-slate-900">Reviews</h2>
          {booking.reviews && booking.reviews.length > 0 ? (
            <ul className="mt-4 space-y-4">
              {booking.reviews.map((r) => (
                <li key={r.id}>
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-slate-900">
                      {r.reviewer.name}{" "}
                      <span className="text-xs font-normal text-slate-400">({r.reviewer.role.toLowerCase()})</span>
                    </p>
                    <StarRating rating={r.rating} />
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{r.comment}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No reviews yet — available once the gig is completed.</p>
          )}
        </div>

        {booking.status === "COMPLETED" && !myReview && (
          <div className="card p-6">
            <h2 className="font-semibold text-slate-900">Leave a review</h2>
            <p className="mb-3 text-sm text-slate-500">
              Review {isClient ? booking.musician.name : booking.client.name} — reviews build trust for
              everyone on the platform.
            </p>
            <ReviewForm bookingId={booking.id} onDone={reload} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function BookingPage() {
  const { id } = useParams<{ id: string }>();
  const [booking, setBooking] = useState<BookingDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setBooking(await api<BookingDTO>(`/bookings/${id}`));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Protected>
      <PageHeader
        title={booking?.gig.title ?? "Booking"}
        subtitle={
          booking
            ? `${formatDateTime(booking.gig.eventDate)} · ${booking.gig.location} · ${booking.client.name} ↔ ${booking.musician.name}`
            : undefined
        }
        action={
          booking ? (
            <Link href={`/gigs/${booking.gigId}`} className="btn-secondary">
              View gig
            </Link>
          ) : null
        }
      />
      {error && <ErrorBanner message={error} />}
      {!booking ? <LoadingBlock label="Loading booking…" /> : <BookingDetail booking={booking} reload={load} />}
    </Protected>
  );
}
