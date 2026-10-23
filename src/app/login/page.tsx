"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import type { SessionUser } from "@/lib/types";
import { ErrorBanner, Field, TextInput } from "@/components/ui";
import GoogleSignInButton from "@/components/GoogleSignInButton";

/** OAuth failure codes → friendly copy (set on the callback redirect). */
const GOOGLE_ERRORS: Record<string, string> = {
  google_unconfigured:
    "Google sign-in isn't configured on this server yet — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (see .env.example).",
  google_denied: "Google sign-in was cancelled or declined.",
  google_state: "That Google sign-in link expired — please try again.",
  google_email: "Your Google account doesn't have a verified email address.",
  google_exchange: "Couldn't complete Google sign-in. Please try again.",
  google_suspended: "This account has been suspended. Contact support.",
};

export default function LoginPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Surface OAuth redirect errors (?error=…) and strip them from the URL.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    if (code && GOOGLE_ERRORS[code]) {
      setError(GOOGLE_ERRORS[code]);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api<{ user: SessionUser }>("/auth/login", {
        method: "POST",
        body: { email, password },
      });
      await refresh();
      router.push("/dashboard");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="card p-8">
        <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
        <p className="mt-1 text-sm text-slate-500">Sign in to manage your gigs and bookings.</p>

        <ErrorBanner message={error} />

        <GoogleSignInButton className="mt-5" next="/dashboard" />

        <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
          <div className="h-px flex-1 bg-slate-200" />
          or continue with email
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Email">
            <TextInput
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </Field>
          <Field label="Password">
            <TextInput
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </Field>
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          New to Gigify?{" "}
          <Link href="/register" className="font-medium text-brand-600 hover:underline">
            Create an account
          </Link>
        </p>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500">
        <p className="font-semibold text-slate-700">Demo accounts (after seeding)</p>
        <p className="mt-1">admin@gigify.test / musician@gigify.test / church@gigify.test</p>
        <p>Password for all: <span className="font-mono">password123</span></p>
      </div>
    </div>
  );
}
