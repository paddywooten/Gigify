"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import Protected from "@/components/Protected";
import { APPLICATION_STATUS_LABELS, BOOKING_STATUS_LABELS, GIG_STATUS_LABELS } from "@/lib/constants";
import type { ApplicationDTO, BookingDTO, GigDTO, Paginated } from "@/lib/types";
import { formatDate, formatMoney } from "@/lib/format";
import { LoadingBlock } from "@/components/Spinner";
import { EmptyState, ErrorBanner, PageHeader, StatusBadge } from "@/components/ui";
import GigCard from "@/components/GigCard";

function BookingRow({ booking }: { booking: BookingDTO }) {
  return (
    <Link
      href={`/bookings/${booking.id}`}
      className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-4 transition hover:border-brand-300 hover:bg-slate-50"
    >
      <div>
        <p className="font-medium text-slate-900">{booking.gig.title}</p>
        <p className="text-sm text-slate-500">
          {formatDate(booking.gig.eventDate)} · {booking.gig.location} · {booking.musician.name}
        </p>
      </div>
      <div className="text-right">
        <p className="font-semibold text-slate-900">{formatMoney(booking.totalCents)}</p>
        <StatusBadge status={booking.status} label={BOOKING_STATUS_LABELS[booking.status]} />
      </div>
    </Link>
  );
}

function MusicianDashboard() {
  const [applications, setApplications] = useState<Paginated<ApplicationDTO> | null>(null);
  const [bookings, setBookings] = useState<BookingDTO[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [apps, bks] = await Promise.all([
        api<Paginated<ApplicationDTO>>("/applications?limit=10"),
        api<Paginated<BookingDTO>>("/bookings"),
      ]);
      setApplications(apps);
      setBookings(bks.items);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function withdraw(id: string) {
    try {
      await api(`/applications/${id}`, { method: "PATCH", body: { action: "WITHDRAW" } });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="space-y-8">
      <ErrorBanner message={error} />

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">My bookings</h2>
          <Link href="/bookings" className="text-sm text-brand-600 hover:underline">
            View all →
          </Link>
        </div>
        {bookings.length === 0 ? (
          <EmptyState
            title="No bookings yet"
            description="When a client accepts your application, the booking and its escrow status appear here."
            action={
              <Link href="/gigs" className="btn-primary">
                Browse open gigs
              </Link>
            }
          />
        ) : (
          <div className="space-y-3">
            {bookings.slice(0, 5).map((b) => (
              <BookingRow key={b.id} booking={b} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-semibold text-slate-900">My recent applications</h2>
        {!applications || applications.items.length === 0 ? (
          <EmptyState
            title="No applications sent yet"
            description="Find a gig that fits your style and introduce yourself to the organizer."
            action={
              <Link href="/gigs" className="btn-primary">
                Find gigs
              </Link>
            }
          />
        ) : (
          <div className="card divide-y divide-slate-100">
            {applications.items.map((app) => (
              <div key={app.id} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <Link
                    href={`/gigs/${app.gigId}`}
                    className="truncate font-medium text-slate-900 hover:text-brand-700"
                  >
                    {app.gig?.title ?? "Gig"}
                  </Link>
                  <p className="text-sm text-slate-500">
                    Applied {formatDate(app.createdAt)} · proposed {formatMoney(app.proposedRateCents)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={app.status} label={APPLICATION_STATUS_LABELS[app.status]} />
                  {app.status === "PENDING" && (
                    <button onClick={() => withdraw(app.id)} className="text-sm text-slate-500 hover:text-rose-600">
                      Withdraw
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ClientDashboard() {
  const [gigs, setGigs] = useState<GigDTO[]>([]);
  const [bookings, setBookings] = useState<BookingDTO[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [myGigs, bks] = await Promise.all([
          api<Paginated<GigDTO>>("/gigs?mine=true&limit=10"),
          api<Paginated<BookingDTO>>("/bookings"),
        ]);
        setGigs(myGigs.items);
        setBookings(bks.items);
      } catch (err) {
        setError(errorMessage(err));
      }
    })();
  }, []);

  return (
    <div className="space-y-8">
      <ErrorBanner message={error} />

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">My bookings</h2>
          <Link href="/bookings" className="text-sm text-brand-600 hover:underline">
            View all →
          </Link>
        </div>
        {bookings.length === 0 ? (
          <EmptyState
            title="No bookings yet"
            description="Accept an application on one of your gigs to create a booking, then fund it to lock in your musician."
            action={
              <Link href="/gigs/new" className="btn-primary">
                Post a gig
              </Link>
            }
          />
        ) : (
          <div className="space-y-3">
            {bookings.slice(0, 5).map((b) => (
              <BookingRow key={b.id} booking={b} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">My gigs</h2>
          <Link href="/gigs/new" className="btn-primary">
            + Post a gig
          </Link>
        </div>
        {gigs.length === 0 ? (
          <EmptyState
            title="You haven't posted a gig yet"
            description="Post your first gig and start receiving applications from local musicians."
            action={
              <Link href="/gigs/new" className="btn-primary">
                Post a gig
              </Link>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {gigs.map((g) => (
              <div key={g.id} className="relative">
                <GigCard gig={g} />
                <span className="absolute right-4 top-4">
                  <StatusBadge status={g.status} label={GIG_STATUS_LABELS[g.status]} />
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  return (
    <Protected>
      <PageHeader
        title={`Welcome back, ${user?.name?.split(" ")[0] ?? ""}`}
        subtitle={
          user?.role === "MUSICIAN"
            ? "Track your applications and upcoming gigs."
            : "Manage your gigs, applications and bookings."
        }
        action={
          user?.role === "MUSICIAN" ? (
            <Link href="/gigs" className="btn-primary">
              Find gigs
            </Link>
          ) : (
            <Link href="/gigs/new" className="btn-primary">
              + Post a gig
            </Link>
          )
        }
      />
      {user?.role === "MUSICIAN" ? <MusicianDashboard /> : <ClientDashboard />}
    </Protected>
  );
}
