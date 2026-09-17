import { config as dotenv } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Load .env.local first (Next.js convention), then .env as fallback. Prisma CLI does not
// inherit Next.js env loading, so we replicate it here for migrate / generate.
dotenv({ path: ".env.local", override: false });
dotenv({ path: ".env", override: false });

type Env = {
  DATABASE_URL: string;
};

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env<Env>("DATABASE_URL"),
  },
});
