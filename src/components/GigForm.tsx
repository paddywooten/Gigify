"use client";

// Gig creation/edit form shared by the "post a gig" page.

import { useState } from "react";
import { GENRES, GIG_TYPES, GIG_TYPE_LABELS } from "@/lib/constants";
import type { GigDTO } from "@/lib/types";
import { api, errorMessage } from "@/lib/api-client";
import { ErrorBanner, Field, Select, TextArea, TextInput } from "./ui";

export default function GigForm({
  initial,
  onSaved,
}: {
  initial?: GigDTO;
  onSaved: (gig: GigDTO) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [gigType, setGigType] = useState<string>(initial?.gigType ?? "CHURCH_SERVICE");
  const [genres, setGenres] = useState<string[]>(initial?.genres ?? []);
  const [eventDate, setEventDate] = useState(initial ? initial.eventDate.slice(0, 10) : "");
  const [durationHours, setDurationHours] = useState(String(initial?.durationHours ?? 2));
  const [location, setLocation] = useState(initial?.location ?? "");
  const [venueName, setVenueName] = useState(initial?.venueName ?? "");
  const [budget, setBudget] = useState(initial ? String(initial.budgetCents / 100) : "");
  const [requirements, setRequirements] = useState(initial?.requirements ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = {
        title,
        description,
        gigType,
        genres,
        eventDate: new Date(`${eventDate}T12:00:00`).toISOString(),
        durationHours: Number(durationHours),
        location,
        venueName: venueName || undefined,
        budgetCents: Math.round(Number(budget) * 100),
        requirements: requirements || undefined,
      };
      const gig = initial
        ? await api<GigDTO>(`/gigs/${initial.id}`, { method: "PATCH", body })
        : await api<GigDTO>("/gigs", { method: "POST", body });
      onSaved(gig);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-5 p-6">
      <ErrorBanner message={error} />

      <Field label="Gig title">
        <TextInput
          required
          minLength={6}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Worship band for Sunday morning service"
        />
      </Field>

      <Field label="Description" hint="What should musicians know? Repertoire, team size, load-in, parking…">
        <TextArea
          required
          rows={5}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="We're a contemporary congregation looking for a 4-piece band to lead two Sunday services…"
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Gig type">
          <Select value={gigType} onChange={(e) => setGigType(e.target.value)}>
            {GIG_TYPES.map((t) => (
              <option key={t} value={t}>
                {GIG_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date">
          <TextInput type="date" required value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
        </Field>
        <Field label="Duration (hours)">
          <TextInput
            type="number"
            min={0.5}
            max={24}
            step={0.5}
            value={durationHours}
            onChange={(e) => setDurationHours(e.target.value)}
          />
        </Field>
        <Field label="Total budget (GH₵)" hint="What the musician receives before platform commission.">
          <TextInput
            type="number"
            min={5}
            step="10"
            required
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="500"
          />
        </Field>
        <Field label="City / region">
          <TextInput required value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Austin, TX" />
        </Field>
        <Field label="Venue name (optional)">
          <TextInput value={venueName} onChange={(e) => setVenueName(e.target.value)} placeholder="Grace Community Church" />
        </Field>
      </div>

      <Field label="Genres (pick up to 6)">
        <div className="flex flex-wrap gap-1.5">
          {GENRES.map((g) => {
            const active = genres.includes(g);
            return (
              <button
                key={g}
                type="button"
                onClick={() =>
                  setGenres(
                    active ? genres.filter((x) => x !== g) : genres.length < 6 ? [...genres, g] : genres,
                  )
                }
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  active ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {g}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Requirements (optional)">
        <TextArea
          rows={3}
          value={requirements}
          onChange={(e) => setRequirements(e.target.value)}
          placeholder="Own transport, ability to rehearse once beforehand, background check required…"
        />
      </Field>

      <div className="flex gap-3">
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? "Saving…" : initial ? "Save changes" : "Publish gig"}
        </button>
      </div>
    </form>
  );
}
