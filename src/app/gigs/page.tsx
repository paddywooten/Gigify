"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, errorMessage } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { GIG_TYPES, GIG_TYPE_LABELS, GENRES } from "@/lib/constants";
import type { GigDTO, Paginated } from "@/lib/types";
import { formatMoney } from "@/lib/format";
import GigCard from "@/components/GigCard";
import { ErrorBanner, PageHeader, Select, TextInput } from "@/components/ui";
import { LoadingBlock } from "@/components/Spinner";
import { EmptyState } from "@/components/ui";

// useSearchParams() requires a Suspense boundary for static prerendering.
export default function GigsPage() {
  return (
    <Suspense>
      <GigsPageInner />
    </Suspense>
  );
}

function GigsPageInner() {
  const { user } = useAuth();
  const params = useSearchParams();
  const [data, setData] = useState<Paginated<GigDTO> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [gigType, setGigType] = useState(params.get("gigType") ?? "");
  const [genre, setGenre] = useState(params.get("genre") ?? "");
  const [minBudget, setMinBudget] = useState("");
  const [mine, setMine] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (search) qs.set("search", search);
      if (gigType) qs.set("gigType", gigType);
      if (genre) qs.set("genre", genre);
      if (minBudget) qs.set("minBudgetCents", String(Math.round(Number(minBudget) * 100)));
      if (mine && user) qs.set("mine", "true");
      qs.set("limit", "24");
      setData(await api<Paginated<GigDTO>>(`/gigs?${qs.toString()}`));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [search, gigType, genre, minBudget, mine, user]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Open gigs"
        subtitle="Church services, weddings, concerts and more, looking for musicians right now."
        action={
          user?.role === "CLIENT" ? (
            <Link href="/gigs/new" className="btn-primary">
              + Post a gig
            </Link>
          ) : null
        }
      />

      <div className="card mb-6 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <TextInput
          placeholder="Search title, description, city…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={gigType} onChange={(e) => setGigType(e.target.value)}>
          <option value="">All gig types</option>
          {GIG_TYPES.map((t) => (
            <option key={t} value={t}>
              {GIG_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
        <Select value={genre} onChange={(e) => setGenre(e.target.value)}>
          <option value="">All genres</option>
          {GENRES.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </Select>
        <TextInput
          type="number"
          min={0}
          placeholder="Min budget ($)"
          value={minBudget}
          onChange={(e) => setMinBudget(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={mine}
            disabled={!user || user.role !== "CLIENT"}
            onChange={(e) => setMine(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          My gigs only
        </label>
      </div>

      {error && <ErrorBanner message={error} />}
      {loading && !data ? (
        <LoadingBlock label="Finding gigs…" />
      ) : data && data.items.length === 0 ? (
        <EmptyState
          title="No gigs match those filters"
          description="Try widening your search — or check back soon, new gigs are posted daily."
          action={
            user?.role === "CLIENT" ? (
              <Link href="/gigs/new" className="btn-primary">
                Post the first gig
              </Link>
            ) : null
          }
        />
      ) : (
        <>
          <div className="mb-3 text-sm text-slate-500">
            {data?.total} gig{data?.total === 1 ? "" : "s"} found
            {data && data.total > 0 && (
              <span> · budgets {formatMoney(Math.min(...data.items.map((g) => g.budgetCents)))}–{formatMoney(Math.max(...data.items.map((g) => g.budgetCents)))}</span>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data?.items.map((gig) => (
              <GigCard key={gig.id} gig={gig} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
