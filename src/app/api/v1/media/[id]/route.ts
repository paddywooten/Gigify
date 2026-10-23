import { NextRequest } from "next/server";
import { handle } from "@/server/http";
import { getMediaForServing } from "@/server/services/media-service";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/**
 * GET: publicly serve one portfolio file (audio/photo). Public musician
 * profiles are meant to be shareable, so media reads are unauthenticated —
 * but only ever by opaque media id, never by storage path.
 */
export const GET = handle(async (req: NextRequest, { params }: Ctx) => {
  const media = await getMediaForServing(params.id);
  return new Response(new Uint8Array(media.data), {
    headers: {
      "content-type": media.mimeType,
      "content-length": String(media.data.length),
      "cache-control": media.cacheHint,
      // Media is inert content; keep sniffing/active content out of the origin.
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
});
