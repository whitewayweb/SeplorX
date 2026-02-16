import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

// Load .env.local for local development
dotenv.config({ path: ".env.local" });

// Migrations need a direct connection (port 5432), not the pooler (port 6543)
// Prefer POSTGRES_URL_NON_POOLING (Vercel/Supabase direct) over DATABASE_URL
const migrationUrl =
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;

if (!migrationUrl) {
  throw new Error(
    "Missing database URL. Set DATABASE_URL or POSTGRES_URL_NON_POOLING in .env.local"
  );
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: migrationUrl,
  },
});
