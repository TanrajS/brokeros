import { BlobNotFoundError, del, get, head, put } from "@vercel/blob";
import { getBlobToken } from "@/server/env";

export class BlobNotConfiguredError extends Error {
  constructor() {
    super("Documents are not configured: BLOB_READ_WRITE_TOKEN is missing.");
  }
}

export function blobReady(): boolean {
  return getBlobToken() !== undefined;
}

function token(): string {
  const t = getBlobToken();
  if (!t) throw new BlobNotConfiguredError();
  return t;
}

/** Stores a workspace upload privately under a random pathname. */
export async function uploadDocumentBlob(pathname: string, body: Buffer | Blob, contentType: string): Promise<{ url: string; pathname: string }> {
  const r = await put(pathname, body, { access: "private", addRandomSuffix: true, contentType, token: token() });
  return { url: r.url, pathname: r.pathname };
}

/**
 * Stores a seed file once under a fixed pathname (`seed/…`). When it already
 * exists it is reused, so repeated seeds and nightly resets never re-upload.
 */
export async function uploadSeedBlob(pathname: string, body: Buffer, contentType: string): Promise<{ url: string; pathname: string; reused: boolean }> {
  const t = token();
  try {
    const existing = await head(pathname, { token: t });
    return { url: existing.url, pathname: existing.pathname, reused: true };
  } catch (err) {
    if (!(err instanceof BlobNotFoundError)) throw err;
  }
  const r = await put(pathname, body, { access: "private", addRandomSuffix: false, allowOverwrite: false, contentType, token: t });
  return { url: r.url, pathname: r.pathname, reused: false };
}

/** Opens a private blob for streaming through the download route. */
export async function openBlob(url: string): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string; size: number } | null> {
  try {
    const r = await get(url, { access: "private", token: token() });
    if (!r || r.statusCode !== 200) return null;
    return { stream: r.stream, contentType: r.blob.contentType, size: r.blob.size };
  } catch (err) {
    if (err instanceof BlobNotFoundError) return null;
    throw err;
  }
}

export async function deleteBlob(url: string): Promise<void> {
  await del(url, { token: token() });
}
