// Media storage abstraction: musician uploads (audio clips, photos) live behind
// a small interface so the backing store can be swapped without touching the
// upload/serving code.
//
//   local (default) — files under UPLOAD_DIR (default `uploads/`), for dev
//   (future)        — Firebase Storage / S3 for production
//
// Callers pass/expect Buffers; streaming large files is a later optimization
// (uploads are capped at 15 MB audio / 5 MB image).

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export interface MediaStorage {
  readonly name: string;
  /** Persists the bytes and returns the storage key identifying them. */
  put(key: string, data: Buffer): Promise<string>;
  /** Reads the bytes for a key. Throws if the key does not exist. */
  get(key: string): Promise<Buffer>;
  /** Deletes a key. Missing keys are a no-op. */
  remove(key: string): Promise<void>;
}

/** Keys are opaque to callers; they look like `<userId>/<uuid>.<ext>`. */
export function isValidStorageKey(key: string): boolean {
  // Reject path traversal and anything outside the safe charset.
  return /^[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/.test(key) && !key.includes("..");
}

export class LocalMediaStorage implements MediaStorage {
  readonly name = "local";
  private root: string;

  constructor(root = process.env.UPLOAD_DIR ?? "uploads") {
    this.root = path.resolve(root);
  }

  private resolve(key: string): string {
    if (!isValidStorageKey(key)) throw new Error(`Invalid storage key: ${key}`);
    const full = path.join(this.root, key);
    // Defense in depth: never escape the root, whatever the key.
    if (!full.startsWith(this.root + path.sep)) throw new Error(`Invalid storage key: ${key}`);
    return full;
  }

  async put(key: string, data: Buffer): Promise<string> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
    return key;
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  async remove(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
}

let override: MediaStorage | null = null;

/** Test hook: inject a storage (or pass null to restore env-based selection). */
export function setMediaStorageForTests(storage: MediaStorage | null): void {
  override = storage;
}

export function getMediaStorage(): MediaStorage {
  if (override) return override;
  const which = (process.env.MEDIA_STORAGE ?? "local").toLowerCase();
  switch (which) {
    case "local":
      return new LocalMediaStorage();
    default:
      throw new Error(
        `Unknown MEDIA_STORAGE "${process.env.MEDIA_STORAGE}". Use "local".`,
      );
  }
}
