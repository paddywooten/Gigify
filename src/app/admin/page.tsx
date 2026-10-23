"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api-client";
import Protected from "@/components/Protected";
import { BOOKING_STATUS_LABELS, ROLE_LABELS } from "@/lib/constants";
import type { AdminStatsDTO, AdminUserDTO, BookingDTO, Paginated, PlatformSettingsDTO } from "@/lib/types";
import { formatDate, formatMoney, formatRate } from "@/lib/format";
import { LoadingBlock } from "@/components/Spinner";
import { ErrorBanner, Field, PageHeader, StatusBadge, SuccessBanner, TextInput } from "@/components/ui";

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

function CommissionSettings() {
  const [settings, setSettings] = useState<PlatformSettingsDTO | null>(null);
  const [rateInput, setRateInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<PlatformSettingsDTO>("/admin/settings")
      .then((s) => {
        setSettings(s);
        setRateInput(String(Math.round(s.commissionRate * 10000) / 10000));
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await api<PlatformSettingsDTO>("/admin/settings", {
        method: "PATCH",
        body: { commissionRate: Number(rateInput) / 100 },
      });
      setSettings(updated);
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!settings) return <LoadingBlock label="Loading settings…" />;

  return (
    <form onSubmit={save} className="card p-6">
      <h2 className="font-semibold text-slate-900">Platform commission</h2>
      <p className="mt-1 text-sm text-slate-500">
        Applied to new bookings only — existing bookings keep the rate they were created with.
      </p>
      <div className="mt-4 flex items-end gap-3">
        <div className="w-40">
          <Field label="Commission rate (%)">
            <TextInput
              type="number"
              min={0}
              max={50}
              step={0.5}
              value={rateInput}
              onChange={(e) => setRateInput(e.target.value)}
            />
          </Field>
        </div>
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      <SuccessBanner message={saved ? `Commission updated to ${formatRate(settings.commissionRate)}.` : null} />
      <ErrorBanner message={error} />
    </form>
  );
}

function Disputes() {
  const [disputes, setDisputes] = useState<BookingDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<Paginated<BookingDTO>>("/bookings?status=DISPUTED");
      setDisputes(res.items);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolve(id: string, outcome: "MUSICIAN_PAYOUT" | "CLIENT_REFUND") {
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/bookings/${id}/resolve`, { method: "POST", body: { outcome } });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-6">
      <h2 className="font-semibold text-slate-900">Open disputes</h2>
      <ErrorBanner message={error} />
      {!disputes ? (
        <LoadingBlock />
      ) : disputes.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">No open disputes. 🎉</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {disputes.map((d) => (
            <li key={d.id} className="rounded-xl border border-rose-200 bg-rose-50/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/bookings/${d.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                  {d.gig.title}
                </Link>
                <span className="font-semibold">{formatMoney(d.totalCents)}</span>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {d.client.name} ↔ {d.musician.name} · {formatDate(d.gig.eventDate)}
              </p>
              {d.disputeReason && <p className="mt-2 text-sm text-rose-700">“{d.disputeReason}”</p>}
              <div className="mt-3 flex gap-2">
                <button
                  disabled={busy}
                  onClick={() => resolve(d.id, "MUSICIAN_PAYOUT")}
                  className="btn-primary"
                >
                  Release to musician ({formatMoney(d.musicianPayoutCents)})
                </button>
                <button disabled={busy} onClick={() => resolve(d.id, "CLIENT_REFUND")} className="btn-secondary">
                  Refund client
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function UsersTable() {
  const [users, setUsers] = useState<Paginated<AdminUserDTO> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setUsers(await api<Paginated<AdminUserDTO>>("/admin/users?limit=50"));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(id: string, body: { isActive?: boolean; role?: string }) {
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/users/${id}`, { method: "PATCH", body });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-6">
      <h2 className="font-semibold text-slate-900">Users</h2>
      <ErrorBanner message={error} />
      {!users ? (
        <LoadingBlock />
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-400">
              <tr>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Joined</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.items.map((u) => (
                <tr key={u.id}>
                  <td className="py-2 pr-4 font-medium text-slate-900">{u.name}</td>
                  <td className="py-2 pr-4 text-slate-600">{u.email}</td>
                  <td className="py-2 pr-4">
                    <select
                      value={u.role}
                      disabled={busy}
                      onChange={(e) => patch(u.id, { role: e.target.value })}
                      className="rounded border border-slate-200 px-2 py-1 text-xs"
                    >
                      {(["MUSICIAN", "CLIENT", "ADMIN"] as const).map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-4 text-slate-500">{formatDate(u.createdAt)}</td>
                  <td className="py-2 pr-4">
                    <StatusBadge
                      status={u.isActive ? "OPEN" : "CANCELLED"}
                      label={u.isActive ? "Active" : "Suspended"}
                    />
                  </td>
                  <td className="py-2">
                    <button
                      disabled={busy}
                      onClick={() => patch(u.id, { isActive: !u.isActive })}
                      className={`text-xs font-medium ${u.isActive ? "text-rose-600" : "text-emerald-600"}`}
                    >
                      {u.isActive ? "Suspend" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-slate-400">
            {users.total} users total · suspending a user immediately invalidates their sessions.
          </p>
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  const [stats, setStats] = useState<AdminStatsDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<AdminStatsDTO>("/admin/stats").then(setStats).catch((err) => setError(errorMessage(err)));
  }, []);

  return (
    <Protected roles={["ADMIN"]}>
      <PageHeader title="Admin console" subtitle="Platform health, revenue and moderation." />
      <ErrorBanner message={error} />
      {!stats ? (
        <LoadingBlock label="Loading stats…" />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Platform revenue"
              value={formatMoney(stats.revenue.platformRevenueCents)}
              hint={`on ${formatMoney(stats.revenue.grossVolumeCents)} gig volume`}
            />
            <StatCard
              label="Musician earnings"
              value={formatMoney(stats.revenue.musicianEarningsCents)}
              hint="paid out on completed + active bookings"
            />
            <StatCard
              label="Bookings"
              value={String(stats.bookings.total)}
              hint={`${stats.bookings.byStatus.DISPUTED ?? 0} in dispute`}
            />
            <StatCard
              label="Open gigs"
              value={String(stats.gigs.open)}
              hint={`${stats.pendingApplications} pending applications`}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <CommissionSettings />
            <Disputes />
          </div>

          <UsersTable />

          <div className="card p-6">
            <h2 className="font-semibold text-slate-900">Booking status breakdown</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {Object.entries(stats.bookings.byStatus).map(([status, count]) => (
                <div key={status} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <StatusBadge status={status} label={BOOKING_STATUS_LABELS[status as keyof typeof BOOKING_STATUS_LABELS] ?? status} />
                  <span className="font-semibold">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Protected>
  );
}
