"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { GENRES, INSTRUMENTS, ORG_TYPES, ROLE_LABELS } from "@/lib/constants";
import type { SessionUser } from "@/lib/types";
import { ErrorBanner, Field, Select, TextInput } from "@/components/ui";
import GoogleSignInButton from "@/components/GoogleSignInButton";

type Role = "MUSICIAN" | "CLIENT";

function ToggleGroup<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-lg border px-3 py-2 text-sm font-medium ${
            value === opt.value
              ? "border-brand-500 bg-brand-50 text-brand-700"
              : "border-slate-300 text-slate-600 hover:bg-slate-50"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
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

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useAuth();
  const [role, setRole] = useState<Role>(
    params.get("role") === "CLIENT" ? "CLIENT" : "MUSICIAN",
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [location, setLocation] = useState("");
  const [instruments, setInstruments] = useState<string[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [dayRate, setDayRate] = useState("350");
  const [organizationName, setOrganizationName] = useState("");
  const [organizationType, setOrganizationType] = useState<string>("CHURCH");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const preset = params.get("role");
    if (preset === "CLIENT" || preset === "MUSICIAN") setRole(preset);
  }, [params]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api<{ user: SessionUser }>("/auth/register", {
        method: "POST",
        body: {
          name,
          email,
          password,
          role,
          location: location || undefined,
          ...(role === "MUSICIAN"
            ? {
                instruments,
                genres,
                dayRateCents: Math.round(Number(dayRate || "0") * 100),
              }
            : {
                organizationName,
                organizationType,
              }),
        },
      });
      await refresh();
      router.push(role === "MUSICIAN" ? "/gigs" : "/gigs/new");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="card p-8">
        <h1 className="text-2xl font-bold text-slate-900">Create your account</h1>
        <p className="mt-1 text-sm text-slate-500">
          Free to join. Musicians pay nothing until a gig is completed.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-5">
          <ErrorBanner message={error} />

          <Field label="I am a…">
            <ToggleGroup<Role>
              value={role}
              onChange={setRole}
              options={[
                { value: "MUSICIAN", label: ROLE_LABELS.MUSICIAN },
                { value: "CLIENT", label: "Church / Event / Venue" },
              ]}
            />
          </Field>

          <GoogleSignInButton role={role} className="mt-1" />

          <div className="flex items-center gap-3 text-xs text-slate-400">
            <div className="h-px flex-1 bg-slate-200" />
            or fill in your details
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <Field label="Your name">
            <TextInput required value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
          </Field>
          <Field label="Email">
            <TextInput
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </Field>
          <Field label="Password" hint="At least 8 characters.">
            <TextInput
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </Field>
          <Field label="City / region">
            <TextInput value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Nashville, TN" />
          </Field>

          {role === "MUSICIAN" ? (
            <>
              <Field label="What do you play?">
                <ChipPicker options={INSTRUMENTS} selected={instruments} onChange={setInstruments} max={5} />
              </Field>
              <Field label="Genres">
                <ChipPicker options={GENRES} selected={genres} onChange={setGenres} max={6} />
              </Field>
              <Field label="Typical day rate (GH₵)" hint="You can negotiate per gig.">
                <TextInput
                  type="number"
                  min={0}
                  step="10"
                  value={dayRate}
                  onChange={(e) => setDayRate(e.target.value)}
                />
              </Field>
            </>
          ) : (
            <>
              <Field label="Organization name">
                <TextInput
                  required
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
            </>
          )}

          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already a member?{" "}
          <Link href="/login" className="font-medium text-brand-600 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
