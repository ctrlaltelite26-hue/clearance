import "@clearance/config";
import { defineConfig } from "drizzle-kit";

const url =
  process.env.DRIZZLE_DATABASE_URL ??
  process.env.DATABASE_URL_DIRECT ??
  process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "Set DRIZZLE_DATABASE_URL, DATABASE_URL, or DATABASE_URL_DIRECT for drizzle-kit",
  );
}

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
});
