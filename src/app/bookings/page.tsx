"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api-client";
import Protected from "@/components/Protected";
import { BOOKING_STATUS_LABELS, BOOKING_STATUSES } from "@/lib/constants";
import type { BookingDTO, Paginated } from "@/lib/types";
import { formatDate, formatMoney } from "@/lib/format";
import { LoadingBlock } from "@/components/Spinner";
import { EmptyState, ErrorBanner, PageHeader, Select, StatusBadge } from "@/components/ui";

export default function BookingsPage() {
  const [data, setData] = useState<Paginated<BookingDTO> | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = status ? `?status=${status}` : "";
      setData(await api<Paginated<BookingDTO>>(`/bookings${qs}`));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Protected>
      <PageHeader
        title="My bookings"
        subtitle="Every gig you've booked, with escrow and payout status."
        action={
          <div className="w-52">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {BOOKING_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {BOOKING_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>
        }
      />

      <ErrorBanner message={error} />
      {loading && !data ? (
        <LoadingBlock label="Loading bookings…" />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title="No bookings here"
          description="Bookings are created when a client accepts a musician's application on a gig."
          action={
            <Link href="/gigs" className="btn-primary">
              Browse gigs
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {data.items.map((b) => (
            <Link
              key={b.id}
              href={`/bookings/${b.id}`}
              className="card flex flex-wrap items-center justify-between gap-4 p-5 transition hover:border-brand-300"
            >
              <div>
                <p className="font-semibold text-slate-900">{b.gig.title}</p>
                <p className="text-sm text-slate-500">
                  {formatDate(b.gig.eventDate)} · {b.gig.location} · with {b.musician.name} for {b.client.name}
                </p>
              </div>
              <div className="text-right">
                <p className="font-bold text-slate-900">{formatMoney(b.totalCents)}</p>
                <StatusBadge status={b.status} label={BOOKING_STATUS_LABELS[b.status]} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </Protected>
  );
}
