"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { ROLE_LABELS } from "@/lib/constants";
import { relativeTime } from "@/lib/format";

export default function Nav() {
  const { user, loading, logout, notifications, unreadCount, markNotificationsRead } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMenuOpen(false);
    setNotifOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const links = [
    { href: "/gigs", label: "Find gigs" },
    { href: "/musicians", label: "Find musicians" },
    ...(user ? [{ href: "/dashboard", label: "Dashboard" }] : []),
    ...(user?.role === "ADMIN" ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold text-slate-900">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">♪</span>
          Gigify
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-lg px-3 py-2 text-sm font-medium ${
                pathname.startsWith(l.href)
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {loading ? null : user ? (
            <>
              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => {
                    setNotifOpen((v) => !v);
                    if (!notifOpen && unreadCount > 0) void markNotificationsRead();
                  }}
                  className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                  aria-label="Notifications"
                >
                  <span aria-hidden>🔔</span>
                  {unreadCount > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
                      {unreadCount}
                    </span>
                  )}
                </button>
                {notifOpen && (
                  <div className="absolute right-0 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                    <div className="border-b border-slate-100 px-4 py-2 text-sm font-semibold">
                      Notifications
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <p className="px-4 py-6 text-center text-sm text-slate-500">
                          Nothing yet — activity on your gigs and bookings shows up here.
                        </p>
                      ) : (
                        notifications.map((n) => (
                          <div key={n.id} className="border-b border-slate-50 px-4 py-3 last:border-0">
                            <p className="text-sm font-medium text-slate-900">{n.title}</p>
                            <p className="mt-0.5 text-xs text-slate-600">{n.body}</p>
                            <p className="mt-1 text-[11px] text-slate-400">{relativeTime(n.createdAt)}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="relative">
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="hidden sm:inline">{user.name}</span>
                </button>
                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                    <div className="border-b border-slate-100 px-4 py-2">
                      <p className="truncate text-sm font-medium">{user.name}</p>
                      <p className="text-xs text-slate-500">{ROLE_LABELS[user.role]}</p>
                    </div>
                    <Link href="/profile" className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                      Profile settings
                    </Link>
                    <Link href="/bookings" className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                      My bookings
                    </Link>
                    <button
                      onClick={async () => {
                        await logout();
                        router.push("/");
                      }}
                      className="block w-full px-4 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-secondary">
                Sign in
              </Link>
              <Link href="/register" className="btn-primary hidden sm:inline-flex">
                Join free
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Mobile nav */}
      <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-4 py-2 md:hidden">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
              pathname.startsWith(l.href) ? "bg-brand-50 text-brand-700" : "text-slate-600"
            }`}
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
