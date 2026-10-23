"use client";

import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import Protected from "@/components/Protected";
import { GENRES, INSTRUMENTS, ORG_TYPES } from "@/lib/constants";
import { ErrorBanner, Field, PageHeader, Select, SuccessBanner, TextArea, TextInput } from "@/components/ui";

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
  return (
    <Protected>
      <PageHeader title="Profile settings" subtitle="How organizers and musicians see you on SoundBridge." />
      <ProfileForm />
    </Protected>
  );
}
