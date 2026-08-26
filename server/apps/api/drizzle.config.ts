import { env } from 'node:process'

import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dbCredentials: {
    url: env.DATABASE_URL!,
  },
  dialect: 'postgresql',
  out: './drizzle',
  schema: ['./src/schemas/**/*.ts', '../../packages/auth-shared/src/schema.ts'],
  // https://github.com/drizzle-team/drizzle-orm/issues/4008
  tablesFilter: ['!vchordrq_sampled_queries'],
})
