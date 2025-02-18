import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './playground/db/schema.ts',
  out: './playground/drizzle',
})
