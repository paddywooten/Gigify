import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: {
    default: "SoundBridge — book trusted musicians for churches & events",
    template: "%s · SoundBridge",
  },
  description:
    "SoundBridge connects churches, venues and event organizers with reviewed musicians. Escrow-backed payments, transparent platform commission, gig-ready contracts.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <AuthProvider>
          <Nav />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
          <footer className="border-t border-slate-200 bg-white">
            <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-sm text-slate-500 sm:flex-row sm:px-6">
              <p>© {new Date().getFullYear()} SoundBridge. Built for musicians and the communities they serve.</p>
              <p>
                Platform commission is a transparent <span className="font-medium text-slate-700">15%</span> on
                completed gigs.
              </p>
            </div>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
