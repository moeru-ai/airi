import { env } from 'node:process'

import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: ['./src/schemas/**/*.ts', '../../packages/auth-shared/src/schema.ts', '../../packages/config-shared/src/schema.ts'],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: env.DATABASE_URL!,
  },
  // https://github.com/drizzle-team/drizzle-orm/issues/4008
  tablesFilter: ['!vchordrq_sampled_queries'],
})
