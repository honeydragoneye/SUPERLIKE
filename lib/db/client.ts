import { Pool, type QueryResultRow } from "pg";

/**
 * One connection pool for the whole server process.
 *
 * Kept on `globalThis` because `next dev` reloads modules on every edit; a pool
 * made per reload would leave the old ones holding connections open until the
 * database refuses new ones. Neon's pooled address (the `-pooler` host) is what
 * DATABASE_URL should point at.
 *
 * Server only: DATABASE_URL has no NEXT_PUBLIC_ prefix and nothing here may be
 * imported from a client component.
 */
const globalForDb = globalThis as unknown as { superlikePool?: Pool };

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not set");
    this.name = "DatabaseNotConfiguredError";
  }
}

function pool(): Pool {
  if (globalForDb.superlikePool) return globalForDb.superlikePool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new DatabaseNotConfiguredError();
  globalForDb.superlikePool = new Pool({
    // `require` already means full verification in this driver; saying so keeps it that way after the next major version
    connectionString: url.replace("sslmode=require", "sslmode=verify-full"),
    // a free database goes to sleep and takes a moment to wake: wait for it, but not forever
    connectionTimeoutMillis: 15_000,
    idleTimeoutMillis: 30_000,
    max: 5,
  });
  return globalForDb.superlikePool;
}

export async function query<R extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<R[]> {
  const result = await pool().query<R>(text, params);
  return result.rows;
}

/** Whether the database can be used at all — routes answer 503 instead of crashing without it. */
export function databaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}
