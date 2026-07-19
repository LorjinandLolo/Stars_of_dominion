import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Match Next.js env loading: .env.local wins, .env is the fallback.
config({ path: ".env.local" });
config({ path: ".env" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
