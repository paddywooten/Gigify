// Musician media: audio samples and photos uploaded to a musician's portfolio.
// The bytes live in MediaStorage; the database stores metadata + a public
// serving URL (`/api/v1/media/:id`).

import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db";
import { badRequest, forbidden, notFound } from "@/server/errors";
import type { SessionUser } from "@/server/auth/session";
import { getMediaStorage, isValidStorageKey } from "@/server/media/storage";
import type { MediaAssetDTO } from "@/lib/types";

export const AUDIO_MAX_BYTES = 15 * 1024 * 1024; // 15 MB
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const MEDIA_MAX_PER_MUSICIAN = 20;

const AUDIO_TYPES: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/aac": "aac",
};

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function mediaKindFor(mimeType: string): "AUDIO" | "IMAGE" | null {
  if (AUDIO_TYPES[mimeType]) return "AUDIO";
  if (IMAGE_TYPES[mimeType]) return "IMAGE";
  return null;
}

export function toMediaAssetDTO(row: {
  id: string;
  kind: string;
  title: string | null;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
}): MediaAssetDTO {
  return {
    id: row.id,
    kind: row.kind as "AUDIO" | "IMAGE",
    title: row.title,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    url: `/api/v1/media/${row.id}`,
    createdAt: row.createdAt.toISOString(),
  };
}

type UploadInput = {
  mimeType: string;
  data: Buffer;
  title?: string | null;
};

/** Validates and stores one portfolio file for the signed-in musician. */
export async function uploadMedia(user: SessionUser, input: UploadInput): Promise<MediaAssetDTO> {
  if (user.role !== "MUSICIAN") {
    throw forbidden("Only musicians can upload portfolio media.");
  }
  const kind = mediaKindFor(input.mimeType);
  if (!kind) {
    throw badRequest(
      `Unsupported file type "${input.mimeType}". Allowed: ${Object.keys(AUDIO_TYPES).concat(Object.keys(IMAGE_TYPES)).join(", ")}.`,
    );
  }
  const max = kind === "AUDIO" ? AUDIO_MAX_BYTES : IMAGE_MAX_BYTES;
  if (input.data.length === 0) throw badRequest("The uploaded file is empty.");
  if (input.data.length > max) {
    throw badRequest(
      `File too large (${(input.data.length / 1024 / 1024).toFixed(1)} MB). ` +
        `${kind === "AUDIO" ? "Audio" : "Image"} uploads are capped at ${max / 1024 / 1024} MB.`,
    );
  }

  const existing = await prisma.mediaAsset.count({ where: { ownerId: user.id } });
  if (existing >= MEDIA_MAX_PER_MUSICIAN) {
    throw badRequest(
      `Portfolio limit reached (${MEDIA_MAX_PER_MUSICIAN} files). Delete something to upload more.`,
    );
  }

  const id = randomUUID();
  const ext = AUDIO_TYPES[input.mimeType] ?? IMAGE_TYPES[input.mimeType];
  const key = `${user.id}/${id}.${ext}`;
  await getMediaStorage().put(key, input.data);

  try {
    const row = await prisma.mediaAsset.create({
      data: {
        id,
        ownerId: user.id,
        kind,
        title: input.title?.trim() || null,
        mimeType: input.mimeType,
        sizeBytes: input.data.length,
        storageKey: key,
      },
    });
    return toMediaAssetDTO(row);
  } catch (err) {
    // Don't orphan the file if the row write fails.
    await getMediaStorage().remove(key).catch(() => undefined);
    throw err;
  }
}

/** The signed-in musician's own media (profile management view). */
export async function listOwnMedia(user: SessionUser): Promise<MediaAssetDTO[]> {
  const rows = await prisma.mediaAsset.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toMediaAssetDTO);
}

/** Media on a public musician profile (audio first, then photos). */
export async function listProfileMedia(musicianUserId: string): Promise<MediaAssetDTO[]> {
  const rows = await prisma.mediaAsset.findMany({
    where: { ownerId: musicianUserId, owner: { isActive: true, role: "MUSICIAN" } },
    orderBy: [{ kind: "asc" }, { createdAt: "desc" }], // AUDIO < IMAGE alphabetically
  });
  return rows.map(toMediaAssetDTO);
}

/** Owner-only delete; the bytes are removed too. */
export async function deleteMedia(user: SessionUser, id: string): Promise<void> {
  const row = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!row || row.ownerId !== user.id) throw notFound("Media not found.");
  await prisma.mediaAsset.delete({ where: { id } });
  if (isValidStorageKey(row.storageKey)) {
    await getMediaStorage().remove(row.storageKey).catch((err) => {
      console.warn(`[media] failed to remove ${row.storageKey}:`, err instanceof Error ? err.message : err);
    });
  }
}

export type ResolvedMedia = {
  data: Buffer;
  mimeType: string;
  cacheHint: string;
};

/** Loads bytes for the public serving route (public profiles = public media). */
export async function getMediaForServing(id: string): Promise<ResolvedMedia> {
  const row = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!row || !isValidStorageKey(row.storageKey)) throw notFound("Media not found.");
  const data = await getMediaStorage().get(row.storageKey).catch(() => null);
  if (!data) throw notFound("Media not found.");
  return { data, mimeType: row.mimeType, cacheHint: "public, max-age=86400" };
}
