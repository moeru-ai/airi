import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dbCredentials: {
    url: './data/pglite-db',
  },
  dialect: 'postgresql',
  driver: 'pglite',
  out: './drizzle',
  schema: './src/lib/schema.ts',
})
