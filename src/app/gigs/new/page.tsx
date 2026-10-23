"use client";

import { useRouter } from "next/navigation";
import Protected from "@/components/Protected";
import GigForm from "@/components/GigForm";
import { PageHeader } from "@/components/ui";
import type { GigDTO } from "@/lib/types";

export default function NewGigPage() {
  const router = useRouter();
  return (
    <Protected roles={["CLIENT", "ADMIN"]}>
      <PageHeader
        title="Post a gig"
        subtitle="Musicians will start applying within hours. You only pay once the gig is done."
      />
      <div className="max-w-2xl">
        <GigForm onSaved={(gig: GigDTO) => router.push(`/gigs/${gig.id}`)} />
      </div>
    </Protected>
  );
}
