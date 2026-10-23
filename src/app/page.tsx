import Link from "next/link";

const STEPS = [
  {
    icon: "🏛️",
    title: "Churches & organizers post a gig",
    body: "Service, wedding, concert or festival — set your date, venue and budget. It takes two minutes.",
  },
  {
    icon: "🎸",
    title: "Musicians apply with their rate",
    body: "Verified local musicians send an application with a short intro, their day rate and audio samples.",
  },
  {
    icon: "🔒",
    title: "Escrow protects both sides",
    body: "The client funds the booking up front. Funds are held safely and released to the musician on completion.",
  },
];

const GIG_KINDS = ["Church service", "Wedding", "Concert", "Corporate event", "Festival", "Youth night"];

export default function LandingPage() {
  return (
    <div className="space-y-20">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-violet-600 px-6 py-16 text-white sm:px-12 sm:py-24">
        <div className="max-w-2xl">
          <p className="badge bg-white/15 text-white">Marketplace for live music</p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
            The right musician for every gathering.
          </h1>
          <p className="mt-4 text-lg text-white/85">
            Gigify connects churches, venues and event organizers with reviewed local musicians —
            with escrow-backed payments and a transparent platform commission, so everyone knows where
            the money goes.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register?role=CLIENT" className="btn bg-white text-brand-700 hover:bg-brand-50">
              Post a gig
            </Link>
            <Link
              href="/register?role=MUSICIAN"
              className="btn border border-white/40 text-white hover:bg-white/10"
            >
              Join as a musician
            </Link>
            <Link href="/gigs" className="btn text-white/90 hover:bg-white/10">
              Browse gigs →
            </Link>
          </div>
        </div>
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 text-[16rem] opacity-10">
          ♪
        </div>
      </section>

      {/* How it works */}
      <section>
        <h2 className="text-center text-3xl font-bold text-slate-900">How it works</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <div key={step.title} className="card p-6">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-50 text-xl">
                  {step.icon}
                </span>
                <span className="text-sm font-semibold text-brand-600">Step {i + 1}</span>
              </div>
              <h3 className="mt-4 font-semibold text-slate-900">{step.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Gig kinds */}
      <section className="card p-8">
        <h2 className="text-2xl font-bold text-slate-900">Built for every kind of gathering</h2>
        <p className="mt-2 text-sm text-slate-600">
          From Sunday morning worship to Saturday night weddings — one place to find and book live music.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          {GIG_KINDS.map((k) => (
            <span key={k} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700">
              {k}
            </span>
          ))}
        </div>
      </section>

      {/* Commission transparency */}
      <section className="grid gap-6 md:grid-cols-2">
        <div className="card p-8">
          <h2 className="text-2xl font-bold text-slate-900">Transparent by design</h2>
          <ul className="mt-4 space-y-3 text-sm text-slate-700">
            <li className="flex gap-2">
              <span className="text-brand-600">✓</span> A flat <strong>15% platform commission</strong> on
              completed gigs — shown to both sides before anyone commits.
            </li>
            <li className="flex gap-2">
              <span className="text-brand-600">✓</span> The rate is locked in at booking time, so a later
              settings change never rewrites an existing deal.
            </li>
            <li className="flex gap-2">
              <span className="text-brand-600">✓</span> Escrow means musicians get paid for work done, and
              clients only pay for gigs that happened.
            </li>
            <li className="flex gap-2">
              <span className="text-brand-600">✓</span> Disputes are reviewed by the platform team with a
              full payment audit trail.
            </li>
          </ul>
        </div>
        <div className="card p-8">
          <h2 className="text-2xl font-bold text-slate-900">Example split</h2>
          <p className="mt-2 text-sm text-slate-600">A $1,000 gig at the standard 15% commission:</p>
          <dl className="mt-6 space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
              <dt className="text-sm text-slate-600">Gig total (client pays)</dt>
              <dd className="font-semibold">$1,000.00</dd>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-4 py-3">
              <dt className="text-sm text-emerald-800">Musician receives</dt>
              <dd className="font-semibold text-emerald-800">$850.00</dd>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-brand-50 px-4 py-3">
              <dt className="text-sm text-brand-800">Platform commission (15%)</dt>
              <dd className="font-semibold text-brand-800">$150.00</dd>
            </div>
          </dl>
          <Link href="/register" className="btn-primary mt-6 w-full">
            Create your free account
          </Link>
        </div>
      </section>
    </div>
  );
}
