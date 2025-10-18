import { env, loadEnvFile } from 'node:process'

import { defineConfig } from 'drizzle-kit'

loadEnvFile()
try {
  loadEnvFile('./env.local')
}
catch {}

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: env.DATABASE_URL!,
  },
})
