import { env, loadEnvFile } from 'node:process'

import { defineConfig } from 'drizzle-kit'

try {
  loadEnvFile()
  loadEnvFile('./env.local')
}
catch {}

export default defineConfig({
  dbCredentials: {
    url: env.DATABASE_URL!,
  },
  dialect: 'postgresql',
  out: './drizzle',
  schema: './src/db/schema.ts',
})
