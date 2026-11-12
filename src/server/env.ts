/**
 * Loads .env.local then .env into process.env for CLI scripts (drizzle-kit, seed).
 * Next.js loads these files itself, so the app never needs to call this.
 * Uses Node's built-in loader; no third-party dotenv package.
 */
export function loadLocalEnv(): void {
  for (const file of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(file);
    } catch {
      // File missing — that's fine; the app explains what to configure.
    }
  }
}

export function getDatabaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL?.trim();
  return url ? url : undefined;
}
