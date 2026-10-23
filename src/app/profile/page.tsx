"use client";

import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import Protected from "@/components/Protected";
import { GENRES, INSTRUMENTS, ORG_TYPES } from "@/lib/constants";
import type { MediaAssetDTO } from "@/lib/types";
import { ErrorBanner, Field, PageHeader, Select, SuccessBanner, TextArea, TextInput } from "@/components/ui";

// Caps enforced server-side in media-service.ts — mirrored here for UX.
const AUDIO_MAX_BYTES = 15 * 1024 * 1024;
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** Upload + manage a musician's audio samples and photos. */
function PortfolioManager() {
  const [items, setItems] = useState<MediaAssetDTO[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    try {
      const res = await api<{ items: MediaAssetDTO[] }>("/profile/media");
      setItems(res.items);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    const kind = file.type.startsWith("audio/") ? "audio" : file.type.startsWith("image/") ? "image" : null;
    const max = kind === "audio" ? AUDIO_MAX_BYTES : kind === "image" ? IMAGE_MAX_BYTES : 0;
    if (!kind) {
      setError("Upload an audio file (mp3, m4a, wav, ogg, aac) or an image (jpg, png, webp).");
      return;
    }
    if (file.size > max) {
      setError(`File too large (${formatBytes(file.size)}). ${kind === "audio" ? "Audio" : "Image"} uploads are capped at ${formatBytes(max)}.`);
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const body = new FormData();
      body.append("file", file);
      if (title.trim()) body.append("title", title.trim());
      const created = await api<MediaAssetDTO>("/profile/media", {
        method: "POST",
        body: body as unknown as Record<string, unknown>,
      });
      setItems((prev) => [created, ...prev]);
      setFile(null);
      setTitle("");
      setNotice("Uploaded — it's live on your public profile.");
      const input = document.getElementById("portfolio-file") as HTMLInputElement | null;
      if (input) input.value = "";
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    setError(null);
    setNotice(null);
    try {
      await api(`/profile/media/${id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((m) => m.id !== id));
      setNotice("File removed from your portfolio.");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <section className="card p-6">
      <h2 className="text-lg font-semibold text-slate-900">Portfolio media</h2>
      <p className="mt-1 text-sm text-slate-500">
        Audio samples and photos on your public profile. Audio up to 15 MB (mp3, m4a, wav, ogg,
        aac); photos up to 5 MB (jpg, png, webp).
      </p>

      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      <form onSubmit={onUpload} className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="File">
            <input
              id="portfolio-file"
              type="file"
              accept="audio/*,image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
            />
          </Field>
          <Field label="Title (optional)" hint="e.g. “Sunday morning worship set” or “Live at Grace Community”">
            <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Give this clip a name" />
          </Field>
        </div>
        <button type="submit" disabled={busy || !file} className="btn-primary">
          {busy ? "Uploading…" : "Upload to portfolio"}
        </button>
      </form>

      <div className="mt-6">
        {!loaded ? (
          <p className="text-sm text-slate-500">Loading portfolio…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500">
            No media yet — organizers book musicians they can hear and see. Add a sample above.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {m.title ?? `${m.kind === "AUDIO" ? "Audio" : "Photo"} file`}
                    <span className="ml-2 text-xs font-normal text-slate-400">
                      {m.kind === "AUDIO" ? "♪" : "🖼"} {m.mimeType} · {formatBytes(m.sizeBytes)}
                    </span>
                  </p>
                  {m.kind === "AUDIO" && (
                    <audio controls preload="none" src={m.url} className="mt-2 w-full max-w-md">
                      <a href={m.url}>Download</a>
                    </audio>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onDelete(m.id)}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function ChipPicker({
  options,
  selected,
  onChange,
  max = 6,
}: {
  options: readonly string[];
  selected: string[];
  onChange: (v: string[]) => void;
  max?: number;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() =>
              onChange(
                active ? selected.filter((s) => s !== opt) : selected.length < max ? [...selected, opt] : selected,
              )
            }
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              active ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function ProfileForm() {
  const { user, refresh } = useAuth();
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [headline, setHeadline] = useState("");
  const [instruments, setInstruments] = useState<string[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [dayRate, setDayRate] = useState("0");
  const [travelRadius, setTravelRadius] = useState("25");
  const [experience, setExperience] = useState("0");
  const [available, setAvailable] = useState(true);
  const [organizationName, setOrganizationName] = useState("");
  const [organizationType, setOrganizationType] = useState("OTHER");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user || loaded) return;
    setName(user.name);
    setBio(user.bio ?? "");
    setLocation(user.location ?? "");
    // Pull the role-specific parts from the profile endpoint.
    (async () => {
      try {
        const data = await api<{
          musician: {
            headline: string | null;
            instruments: string[];
            genres: string[];
            dayRateCents: number;
            travelRadiusKm: number;
            experienceYears: number;
            isAvailable: boolean;
          } | null;
          client: { organizationName: string; organizationType: string } | null;
        }>("/profile");
        if (data.musician) {
          const m = data.musician;
          setHeadline(m.headline ?? "");
          setInstruments(m.instruments);
          setGenres(m.genres);
          setDayRate(String(m.dayRateCents / 100));
          setTravelRadius(String(m.travelRadiusKm));
          setExperience(String(m.experienceYears));
          setAvailable(m.isAvailable);
        }
        if (data.client) {
          setOrganizationName(data.client.organizationName);
          setOrganizationType(data.client.organizationType);
        }
      } catch {
        // Profile may just not be filled in yet.
      }
      setLoaded(true);
    })();
  }, [user, loaded]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api("/profile", {
        method: "PATCH",
        body: {
          name,
          bio,
          location,
          ...(user?.role === "MUSICIAN"
            ? {
                headline,
                instruments,
                genres,
                dayRateCents: Math.round(Number(dayRate) * 100),
                travelRadiusKm: Number(travelRadius),
                experienceYears: Number(experience),
                isAvailable: available,
              }
            : {
                organizationName: organizationName || undefined,
                organizationType,
              }),
        },
      });
      await refresh();
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card max-w-2xl space-y-5 p-6">
      <ErrorBanner message={error} />
      <SuccessBanner message={saved ? "Profile saved." : null} />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="City / region">
          <TextInput value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Nashville, TN" />
        </Field>
      </div>

      <Field label="About you">
        <TextArea rows={4} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell organizers about yourself…" />
      </Field>

      {user?.role === "MUSICIAN" ? (
        <>
          <Field label="Headline">
            <TextInput
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="Worship leader & acoustic vocalist"
            />
          </Field>
          <Field label="Instruments (up to 5)">
            <ChipPicker options={INSTRUMENTS} selected={instruments} onChange={setInstruments} max={5} />
          </Field>
          <Field label="Genres (up to 6)">
            <ChipPicker options={GENRES} selected={genres} onChange={setGenres} max={6} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Day rate ($)">
              <TextInput type="number" min={0} step="10" value={dayRate} onChange={(e) => setDayRate(e.target.value)} />
            </Field>
            <Field label="Travel radius (km)">
              <TextInput
                type="number"
                min={0}
                value={travelRadius}
                onChange={(e) => setTravelRadius(e.target.value)}
              />
            </Field>
            <Field label="Years playing">
              <TextInput
                type="number"
                min={0}
                value={experience}
                onChange={(e) => setExperience(e.target.value)}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={available}
              onChange={(e) => setAvailable(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            I&apos;m available for new bookings
          </label>
        </>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Organization name">
            <TextInput
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              placeholder="Grace Community Church"
            />
          </Field>
          <Field label="Organization type">
            <Select value={organizationType} onChange={(e) => setOrganizationType(e.target.value)}>
              {ORG_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0) + t.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}

      <div>
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? "Saving…" : "Save profile"}
        </button>
      </div>
    </form>
  );
}

export default function ProfilePage() {
  const { user } = useAuth();
  return (
    <Protected>
      <PageHeader title="Profile settings" subtitle="How organizers and musicians see you on Gigify." />
      <div className="space-y-6">
        <ProfileForm />
        {user?.role === "MUSICIAN" && <PortfolioManager />}
      </div>
    </Protected>
  );
}
