// Musician portfolio media: upload validation, public serving, and deletion.

import { describe, expect, it, beforeAll } from "vitest";
import { registerUser, toSessionUser } from "./helpers/app";
import { uploadMedia, listOwnMedia, deleteMedia, getMediaForServing } from "@/server/services/media-service";

// Tiny but valid payloads — we never decode the bytes, so content is opaque.
const WAV_BYTES = Buffer.from("RIFF....WAVEfmt ");
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

beforeAll(() => {
  process.env.MEDIA_STORAGE = "local";
  process.env.UPLOAD_DIR = "/tmp/gigify-test-uploads";
});

describe("media-service upload", () => {
  it("rejects non-musician uploads", async () => {
    const client = toSessionUser(await registerUser("CLIENT"));
    await expect(
      uploadMedia(client, { mimeType: "audio/mpeg", data: WAV_BYTES, title: null }),
    ).rejects.toThrow(/only musicians/i);
  });

  it("accepts supported audio and image types and reports size", async () => {
    const musician = toSessionUser(await registerUser("MUSICIAN"));

    const audio = await uploadMedia(musician, {
      mimeType: "audio/mpeg",
      data: WAV_BYTES,
      title: "Sunday set",
    });
    expect(audio.kind).toBe("AUDIO");
    expect(audio.title).toBe("Sunday set");
    expect(audio.sizeBytes).toBe(WAV_BYTES.length);
    expect(audio.url).toMatch(/^\/api\/v1\/media\//);

    const image = await uploadMedia(musician, {
      mimeType: "image/png",
      data: PNG_BYTES,
      title: null,
    });
    expect(image.kind).toBe("IMAGE");
    expect(image.title).toBeNull();

    const mine = await listOwnMedia(musician);
    expect(mine).toHaveLength(2);
  });

  it("rejects unsupported mime types", async () => {
    const musician = toSessionUser(await registerUser("MUSICIAN"));
    await expect(
      uploadMedia(musician, { mimeType: "application/pdf", data: WAV_BYTES, title: null }),
    ).rejects.toThrow(/unsupported file type/i);
  });

  it("rejects empty and oversized files with a clear message", async () => {
    const musician = toSessionUser(await registerUser("MUSICIAN"));
    await expect(
      uploadMedia(musician, { mimeType: "audio/mpeg", data: Buffer.alloc(0), title: null }),
    ).rejects.toThrow(/empty/i);

    const huge = Buffer.alloc(16 * 1024 * 1024); // 16 MB > 15 MB audio cap
    await expect(
      uploadMedia(musician, { mimeType: "audio/mpeg", data: huge, title: null }),
    ).rejects.toThrow(/too large/i);
  });
});

describe("media serving + deletion", () => {
  it("serves stored bytes with the original mime type, and deletes cleanly", async () => {
    const musician = toSessionUser(await registerUser("MUSICIAN"));
    const clip = await uploadMedia(musician, {
      mimeType: "audio/wav",
      data: WAV_BYTES,
      title: "Worship clip",
    });

    const served = await getMediaForServing(clip.id);
    expect(served.mimeType).toBe("audio/wav");
    expect(served.data.equals(WAV_BYTES)).toBe(true);
    expect(served.cacheHint).toMatch(/public/);

    await deleteMedia(musician, clip.id);
    await expect(getMediaForServing(clip.id)).rejects.toThrow(/not found/i);
    expect(await listOwnMedia(musician)).toHaveLength(0);
  });

  it("one musician cannot delete another musician's media", async () => {
    const owner = toSessionUser(await registerUser("MUSICIAN"));
    const other = toSessionUser(await registerUser("MUSICIAN"));
    const clip = await uploadMedia(owner, { mimeType: "audio/mpeg", data: WAV_BYTES, title: null });

    await expect(deleteMedia(other, clip.id)).rejects.toThrow(/not found/i);
    // Owner's copy is intact.
    await expect(getMediaForServing(clip.id)).resolves.toBeTruthy();
  });
});
