"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { APPLICATION_STATUS_LABELS, GIG_TYPE_LABELS } from "@/lib/constants";
import type { ApplicationDTO, BookingDTO, GigDTO } from "@/lib/types";
import { formatDate, formatMoney } from "@/lib/format";
import StarRating from "@/components/StarRating";
import { LoadingBlock } from "@/components/Spinner";
import {
  Badge,
  ErrorBanner,
  Field,
  PageHeader,
  StatusBadge,
  SuccessBanner,
  Tag,
  TextArea,
  TextInput,
} from "@/components/ui";

export default function GigDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [gig, setGig] = useState<GigDTO | null>(null);
  const [applications, setApplications] = useState<ApplicationDTO[]>([]);
  const [booking, setBooking] = useState<BookingDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [message, setMessage] = useState("");
  const [rate, setRate] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const g = await api<GigDTO>(`/gigs/${id}`);
      setGig(g);
      if (user && (g.organizer.id === user.id || user.role === "ADMIN")) {
        const apps = await api<{ items: ApplicationDTO[] }>(`/gigs/${id}/applications`);
        setApplications(apps.items);
      }
      if (user && (g.organizer.id === user.id || user.role === "ADMIN") && g.status === "BOOKED") {
        const bookings = await api<{ items: BookingDTO[] }>("/bookings");
        setBooking(bookings.items.find((b) => b.gigId === g.id) ?? null);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id, user]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.id]);

  async function apply(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/gigs/${id}/applications`, {
        method: "POST",
        body: { message, proposedRateCents: Math.round(Number(rate) * 100) },
      });
      setNotice("Application sent! The organizer will be notified.");
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function decide(applicationId: string, action: "ACCEPT" | "REJECT") {
    setBusy(true);
    setError(null);
    try {
      if (action === "ACCEPT") {
        await api(`/applications/${applicationId}`, {
          method: "PATCH",
          body: { action: "ACCEPT" },
        });
        setNotice("Musician booked! Fund the escrow to secure the date.");
      } else {
        await api(`/applications/${applicationId}`, { method: "PATCH", body: { action: "REJECT" } });
      }
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingBlock label="Loading gig…" />;
  if (!gig) {
    return (
      <div className="card p-8 text-center text-sm text-slate-600">
        {error ?? "Gig not found."}{" "}
        <Link href="/gigs" className="text-brand-600 hover:underline">
          Back to gigs
        </Link>
      </div>
    );
  }

  const isOwner = user?.id === gig.organizer.id || user?.role === "ADMIN";
  const myApplication = gig.myApplication;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <PageHeader
          title={gig.title}
          subtitle={`${GIG_TYPE_LABELS[gig.gigType]} · posted ${formatDate(gig.createdAt)}`}
          action={gig.status !== "OPEN" ? <StatusBadge status={gig.status} label={gig.status} /> : null}
        />

        <ErrorBanner message={error} />
        <SuccessBanner message={notice} />

        <div className="card p-6">
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{gig.description}</p>
          {gig.requirements && (
            <>
              <h3 className="mt-6 font-semibold text-slate-900">Requirements</h3>
              <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{gig.requirements}</p>
            </>
          )}
          {gig.genres.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-1.5">
              {gig.genres.map((g) => (
                <Tag key={g}>{g}</Tag>
              ))}
            </div>
          )}
        </div>

        {/* Applications (owner only) */}
        {isOwner && (
          <section className="card p-6">
            <h2 className="font-semibold text-slate-900">
              Applications ({applications.length})
            </h2>
            {applications.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                No applications yet. Musicians usually respond within a day of posting.
              </p>
            ) : (
              <ul className="mt-4 space-y-4">
                {applications.map((app) => (
                  <li key={app.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <Link
                          href={`/musicians/${app.musician.id}`}
                          className="font-semibold text-slate-900 hover:text-brand-700"
                        >
                          {app.musician.name}
                        </Link>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          {app.musician.headline && <span>{app.musician.headline}</span>}
                          <StarRating rating={app.musician.averageRating} count={app.musician.reviewCount} />
                          {app.musician.location && <span>· {app.musician.location}</span>}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-slate-900">{formatMoney(app.proposedRateCents)}</p>
                        <StatusBadge status={app.status} label={APPLICATION_STATUS_LABELS[app.status]} />
                      </div>
                    </div>
                    <p className="mt-3 text-sm text-slate-600">{app.message}</p>
                    {app.status === "PENDING" && gig.status === "OPEN" && (
                      <div className="mt-4 flex gap-2">
                        <button
                          disabled={busy}
                          onClick={() => decide(app.id, "ACCEPT")}
                          className="btn-primary"
                        >
                          Accept & book
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => decide(app.id, "REJECT")}
                          className="btn-secondary"
                        >
                          Decline
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      {/* Sidebar */}
      <aside className="space-y-4">
        <div className="card p-6">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Budget</dt>
              <dd className="font-semibold">{formatMoney(gig.budgetCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Date</dt>
              <dd className="font-medium">{formatDate(gig.eventDate)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Duration</dt>
              <dd className="font-medium">{gig.durationHours}h</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Location</dt>
              <dd className="font-medium">{gig.venueName ?? gig.location}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Organizer</dt>
              <dd className="font-medium">{gig.organizer.organizationName ?? gig.organizer.name}</dd>
            </div>
          </dl>
        </div>

        {isOwner ? (
          gig.status === "BOOKED" && booking ? (
            <div className="card p-6">
              <h3 className="font-semibold text-slate-900">Booking in progress</h3>
              <p className="mt-1 text-sm text-slate-500">
                {booking.status === "PENDING_FUNDING"
                  ? "Fund the escrow to secure your musician."
                  : `Status: ${booking.status.replace("_", " ").toLowerCase()}`}
              </p>
              <Link href={`/bookings/${booking.id}`} className="btn-primary mt-4 w-full">
                Manage booking
              </Link>
            </div>
          ) : gig.status === "OPEN" ? (
            <div className="card p-6">
              <h3 className="font-semibold text-slate-900">Your gig is live</h3>
              <p className="mt-1 text-sm text-slate-500">
                Musicians are applying now. Accepting an applicant creates a booking you can fund.
              </p>
              <button
                onClick={async () => {
                  try {
                    await api(`/gigs/${gig.id}`, { method: "PATCH", body: { status: "CANCELLED" } });
                    await load();
                  } catch (err) {
                    setError(errorMessage(err));
                  }
                }}
                className="btn-secondary mt-4 w-full"
              >
                Cancel this gig
              </button>
            </div>
          ) : null
        ) : gig.myApplication ? (
          <div className="card p-6">
            <h3 className="font-semibold text-slate-900">Your application</h3>
            <div className="mt-2">
              <StatusBadge
                status={gig.myApplication.status}
                label={APPLICATION_STATUS_LABELS[gig.myApplication.status]}
              />
            </div>
            <p className="mt-3 text-sm text-slate-600">{gig.myApplication.message}</p>
          </div>
        ) : gig.status === "OPEN" && user?.role === "MUSICIAN" ? (
          <form onSubmit={apply} className="card space-y-4 p-6">
            <h3 className="font-semibold text-slate-900">Apply to this gig</h3>
            <Field label="Your rate for this gig (GH₵)">
              <TextInput
                type="number"
                min={5}
                step="10"
                required
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder={user ? "450" : ""}
              />
            </Field>
            <Field label="Message to the organizer">
              <TextArea
                required
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Hi! I lead worship at… we'd love to play your service. Here's what we can bring…"
              />
            </Field>
            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? "Sending…" : "Send application"}
            </button>
          </form>
        ) : !user ? (
          <div className="card p-6 text-center">
            <h3 className="font-semibold text-slate-900">Interested in this gig?</h3>
            <p className="mt-1 text-sm text-slate-500">Create a musician account to apply.</p>
            <div className="mt-4 flex flex-col gap-2">
              <Link href="/register?role=MUSICIAN" className="btn-primary">
                Join as a musician
              </Link>
              <Link href="/login" className="btn-secondary">
                Sign in
              </Link>
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
