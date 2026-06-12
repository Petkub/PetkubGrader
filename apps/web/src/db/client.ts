import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// postgres-js connects lazily — no network until first query.
// During `next build` page-data collection there's no DB, but no query runs either,
// so a placeholder URL is safe. Real URL must be set at runtime.
const url = (process.env.DATABASE_URL ?? "postgresql://build:build@localhost:5432/build").replace(
  "+asyncpg",
  "",
);

const conn = postgres(url, { max: 5, prepare: false });

export const db = drizzle(conn, { schema });
