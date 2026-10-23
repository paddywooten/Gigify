"use client";

// Route guard: renders children only for signed-in users with an allowed role.

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { LoadingBlock } from "./Spinner";
import { EmptyState } from "./ui";
import type { Role } from "@/lib/constants";

export default function Protected({
  roles,
  children,
}: {
  roles?: Role[];
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();

  if (loading) return <LoadingBlock />;
  if (!user) {
    return (
      <EmptyState
        title="Sign in to continue"
        description="This area is only available to signed-in members of SoundBridge."
        action={
          <Link href="/login" className="btn-primary">
            Sign in
          </Link>
        }
      />
    );
  }
  if (roles && !roles.includes(user.role)) {
    return (
      <EmptyState
        title="Not available for your account type"
        description={
          user.role === "MUSICIAN"
            ? "This page is for churches, venues and event organizers. Browse open gigs instead."
            : "This page is for musician accounts."
        }
        action={
          <Link href={user.role === "MUSICIAN" ? "/gigs" : "/musicians"} className="btn-primary">
            {user.role === "MUSICIAN" ? "Browse gigs" : "Find musicians"}
          </Link>
        }
      />
    );
  }
  return <>{children}</>;
}
