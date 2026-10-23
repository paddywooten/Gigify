"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api-client";
import type { MediaAssetDTO, PublicMusicianDTO, ReviewDTO } from "@/lib/types";
import { formatDate, formatMoney } from "@/lib/format";
import StarRating from "@/components/StarRating";
import { LoadingBlock } from "@/components/Spinner";
import { ErrorBanner, PageHeader, Tag } from "@/components/ui";

function MediaGallery({ media }: { media: MediaAssetDTO[] }) {
  const audio = media.filter((m) => m.kind === "AUDIO");
  const images = media.filter((m) => m.kind === "IMAGE");
  if (media.length === 0) return null;

  return (
    <section className="card p-6">
      <h2 className="font-semibold text-slate-900">Samples &amp; portfolio</h2>

      {audio.length > 0 && (
        <ul className="mt-3 space-y-3">
          {audio.map((clip) => (
            <li key={clip.id} className="rounded-xl border border-slate-200 p-3">
              {clip.title && <p className="mb-2 text-sm font-medium text-slate-800">{clip.title}</p>}
              <audio controls preload="none" src={clip.url} className="w-full">
                <a href={clip.url} className="text-sm text-brand-600 hover:underline">
                  Download sample
                </a>
              </audio>
            </li>
          ))}
        </ul>
      )}

      {images.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((img) => (
            <a
              key={img.id}
              href={img.url}
              target="_blank"
              rel="noreferrer"
              className="block overflow-hidden rounded-xl border border-slate-200"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={img.title ?? "Portfolio photo"}
                loading="lazy"
                className="aspect-square w-full object-cover transition hover:scale-105"
              />
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

export default function MusicianDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<{
    musician: PublicMusicianDTO;
    reviews: ReviewDTO[];
    media: MediaAssetDTO[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ musician: PublicMusicianDTO; reviews: ReviewDTO[]; media: MediaAssetDTO[] }>(`/musicians/${id}`)
      .then(setData)
      .catch((err) => setError(errorMessage(err)));
  }, [id]);

  if (error) return <ErrorBanner message={error} />;
  if (!data) return <LoadingBlock label="Loading profile…" />;

  const { musician, reviews, media } = data;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <div className="card p-6">
          <div className="flex items-start gap-4">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-brand-100 text-2xl font-bold text-brand-700">
              {musician.name.charAt(0).toUpperCase()}
            </span>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{musician.name}</h1>
              {musician.headline && <p className="text-slate-600">{musician.headline}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                <StarRating rating={musician.averageRating} count={musician.reviewCount} size="md" />
                {musician.location && <span>📍 {musician.location}</span>}
                <span>{musician.experienceYears} years playing</span>
              </div>
            </div>
          </div>

          {musician.bio && (
            <p className="mt-6 whitespace-pre-line text-sm leading-relaxed text-slate-700">{musician.bio}</p>
          )}

          {(musician.instruments.length > 0 || musician.genres.length > 0) && (
            <div className="mt-6 flex flex-wrap gap-1.5">
              {[...musician.instruments, ...musician.genres].map((t) => (
                <Tag key={t}>{t}</Tag>
              ))}
            </div>
          )}

          {musician.sampleUrls.length > 0 && (
            <div className="mt-6">
              <h3 className="font-semibold text-slate-900">Samples & portfolio</h3>
              <ul className="mt-2 space-y-1">
                {musician.sampleUrls.map((url) => (
                  <li key={url}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-brand-600 hover:underline"
                    >
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <MediaGallery media={media} />

        <section className="card p-6">
          <h2 className="font-semibold text-slate-900">Reviews ({reviews.length})</h2>
          {reviews.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              No reviews yet — reviews appear after completed gigs.
            </p>
          ) : (
            <ul className="mt-4 space-y-4">
              {reviews.map((r) => (
                <li key={r.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-slate-900">{r.reviewer.name}</p>
                    <StarRating rating={r.rating} />
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{r.comment}</p>
                  <p className="mt-2 text-xs text-slate-400">{formatDate(r.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className="space-y-4">
        <div className="card p-6">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Day rate</dt>
              <dd className="font-semibold">{formatMoney(musician.dayRateCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Travel radius</dt>
              <dd className="font-medium">{musician.travelRadiusKm} km</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Completed gigs</dt>
              <dd className="font-medium">{musician.completedBookings}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Availability</dt>
              <dd className="font-medium">{musician.isAvailable ? "Open to bookings" : "Currently booked up"}</dd>
            </div>
          </dl>
        </div>
        <Link href="/gigs/new" className="btn-primary w-full">
          Invite to a gig
        </Link>
        <p className="text-center text-xs text-slate-400">
          Bookings are escrow-protected with a transparent 15% platform commission.
        </p>
      </aside>
    </div>
  );
}
