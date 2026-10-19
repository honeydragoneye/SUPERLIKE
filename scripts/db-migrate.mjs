// Applies lib/db/schema.sql to the database in DATABASE_URL.
//   npm run db:migrate
// The statements are idempotent, so running it twice changes nothing.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (put it in .env.local).");
  process.exit(1);
}

const sql = readFileSync(fileURLToPath(new URL("../lib/db/schema.sql", import.meta.url)), "utf8");
const client = new pg.Client({ connectionString: url.replace("sslmode=require", "sslmode=verify-full"), connectionTimeoutMillis: 20_000 });

try {
  await client.connect();
  await client.query(sql);
  const { rows } = await client.query(
    "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
  );
  console.log("tables:", rows.map((r) => r.table_name).join(", "));
} catch (e) {
  console.error("migration failed:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
