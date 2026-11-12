import { randomInt } from "node:crypto";

/** Lowercase letters and digits, minus look-alikes (0/o, 1/l/i). */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const WORKSPACE_SLUG_LENGTH = 10;

/** A random 10-character workspace slug, e.g. "k7m2pq9xrt". */
export function generateWorkspaceSlug(): string {
  let out = "";
  for (let i = 0; i < WORKSPACE_SLUG_LENGTH; i += 1) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

export function isWorkspaceSlug(value: unknown): value is string {
  return typeof value === "string" && new RegExp(`^[${ALPHABET}]{${WORKSPACE_SLUG_LENGTH}}$`).test(value);
}
