"use client";

import Link from "next/link";
import type { GigDTO } from "@/lib/types";
import { GIG_TYPE_LABELS } from "@/lib/constants";
import { formatDate, formatMoney } from "@/lib/format";
import { Badge, StatusBadge, Tag } from "./ui";

export default function GigCard({ gig }: { gig: GigDTO }) {
  return (
    <Link
      href={`/gigs/${gig.id}`}
      className="card block p-5 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{gig.title}</h3>
          <p className="mt-0.5 text-sm text-slate-500">
            {gig.organizer.organizationName ?? gig.organizer.name}
            {gig.organizer.location ? ` · ${gig.organizer.location}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="text-base font-bold text-slate-900">{formatMoney(gig.budgetCents)}</p>
          <p className="text-xs text-slate-500">budget</p>
        </div>
      </div>

      <p className="mt-3 line-clamp-2 text-sm text-slate-600">{gig.description}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <Badge color="blue">{GIG_TYPE_LABELS[gig.gigType]}</Badge>
        <span>📅 {formatDate(gig.eventDate)}</span>
        <span>📍 {gig.location}</span>
        {gig.status !== "OPEN" && <StatusBadge status={gig.status} label={gig.status} />}
        {typeof gig.applicationCount === "number" && gig.applicationCount > 0 && (
          <span className="text-slate-400">· {gig.applicationCount} applications</span>
        )}
      </div>

      {gig.genres.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {gig.genres.slice(0, 4).map((g) => (
            <Tag key={g}>{g}</Tag>
          ))}
        </div>
      )}
    </Link>
  );
}
