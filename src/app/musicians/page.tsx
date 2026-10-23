"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api-client";
import { GENRES, INSTRUMENTS } from "@/lib/constants";
import type { Paginated, PublicMusicianDTO } from "@/lib/types";
import { formatMoney } from "@/lib/format";
import StarRating from "@/components/StarRating";
import { LoadingBlock } from "@/components/Spinner";
import { Badge, EmptyState, ErrorBanner, PageHeader, Select, Tag, TextInput } from "@/components/ui";

function MusicianCard({ m }: { m: PublicMusicianDTO }) {
  return (
    <Link
      href={`/musicians/${m.id}`}
      className="card block p-5 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-100 text-base font-bold text-brand-700">
            {m.name.charAt(0).toUpperCase()}
          </span>
          <div>
            <h3 className="font-semibold text-slate-900">{m.name}</h3>
            <p className="text-sm text-slate-500">{m.headline ?? m.instruments.join(" · ")}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-bold text-slate-900">{formatMoney(m.dayRateCents)}</p>
          <p className="text-xs text-slate-500">/ day</p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
        <StarRating rating={m.averageRating} count={m.reviewCount} />
        {m.location && <span>📍 {m.location}</span>}
        <span>{m.completedBookings} gigs completed</span>
        {!m.isAvailable && <Badge color="amber">Booked up</Badge>}
      </div>

      {(m.instruments.length > 0 || m.genres.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[...m.instruments, ...m.genres].slice(0, 6).map((t) => (
            <Tag key={t}>{t}</Tag>
          ))}
        </div>
      )}
    </Link>
  );
}

export default function MusiciansPage() {
  const [data, setData] = useState<Paginated<PublicMusicianDTO> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [genre, setGenre] = useState("");
  const [instrument, setInstrument] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (search) qs.set("search", search);
      if (genre) qs.set("genre", genre);
      if (instrument) qs.set("instrument", instrument);
      if (availableOnly) qs.set("availableOnly", "true");
      qs.set("limit", "24");
      setData(await api<Paginated<PublicMusicianDTO>>(`/musicians?${qs.toString()}`));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [search, genre, instrument, availableOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Musician directory"
        subtitle="Reviewed, reliable musicians available for churches, weddings and events."
      />

      <div className="card mb-6 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <TextInput
          placeholder="Search name, instrument, city…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={instrument} onChange={(e) => setInstrument(e.target.value)}>
          <option value="">Any instrument</option>
          {INSTRUMENTS.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </Select>
        <Select value={genre} onChange={(e) => setGenre(e.target.value)}>
          <option value="">Any genre</option>
          {GENRES.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={availableOnly}
            onChange={(e) => setAvailableOnly(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          Available only
        </label>
      </div>

      {error && <ErrorBanner message={error} />}
      {loading && !data ? (
        <LoadingBlock label="Searching musicians…" />
      ) : data && data.items.length === 0 ? (
        <EmptyState
          title="No musicians match those filters"
          description="Try a different instrument or genre combination."
        />
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-500">{data?.total} musicians found</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data?.items.map((m) => (
              <MusicianCard key={m.id} m={m} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
