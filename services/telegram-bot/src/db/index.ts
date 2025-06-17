import { env } from 'node:process'

import { drizzle } from 'drizzle-orm/node-postgres'

import * as schema from './schema'

let db: ReturnType<typeof initDb>

export function initDb() {
  return drizzle(env.DATABASE_URL!, { schema })
}

export function useDrizzle() {
  if (!db)
    db = initDb()

  return db
}
