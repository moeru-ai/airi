import type { Request } from 'express'

import fs from 'node:fs'

import { dirname, resolve } from 'node:path'
import { cwd, env, exit } from 'node:process'
import { fileURLToPath } from 'node:url'

import EmbeddedPostgres from 'embedded-postgres'

import { PGlite } from '@electric-sql/pglite'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { drizzle as drizzleLite } from 'drizzle-orm/pglite'
import { migrate as migrateLite } from 'drizzle-orm/pglite/migrator'
import { Pool } from 'pg'

import * as schema from './schema'

// Database connection pool
let pool: Pool | null
let dbPg: ReturnType<typeof drizzle> | null
let lite: PGlite | null
let dbLite: ReturnType<typeof drizzleLite> | null
let embeddedPostgres: EmbeddedPostgres | null = null
// TODO: Toggle boolean value via settings page
// TODO: Avoid using global scope variable
let embeddedPostgresEnabled: boolean = false
let pgLiteEnabled: boolean = false

/**
 * Initialized embedded postgres
 */
export function isEmbeddedPostgresEnabled() {
  return embeddedPostgresEnabled
}

export function setEmbeddedPostgresEnabled(enabled: boolean) {
  embeddedPostgresEnabled = enabled
}

/**
 * Initialized PGlite
 */
export function isPGliteEnabled() {
  return pgLiteEnabled
}

export function setPGliteEnabled(enabled: boolean) {
  pgLiteEnabled = enabled
}

function truthy(v: unknown) {
  if (v === true)
    return true
  if (typeof v === 'string')
    return ['true', '1', 'yes', 'y', 'on', 'pglite'].includes(v.toLowerCase())
  return false
}

export function resolveVariantFromReq(req?: Request): 'pglite' | 'pg' {
  const hdr = String(req?.headers['x-db-variant'] || '').toLowerCase()
  const q = (req?.query as any) || {}
  if (hdr === 'pglite' || truthy(q.isPglite))
    return 'pglite'
  if (hdr === 'pg' || (q.isPglite && !truthy(q.isPglite)))
    return 'pg'
  return isPGliteEnabled() ? 'pglite' : 'pg'
}

// extend ImportMeta type
export async function initEmbeddedPostgres() {
  if (!embeddedPostgres) {
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = dirname(__filename)
    const dataDir = resolve(__dirname, '../../.embedded_pg')
    env.PGDATA = dataDir
    if (!env.DATABASE_URL)
      env.DATABASE_URL = 'postgres://postgres:airi_memory_password@localhost:5433/postgres'
    embeddedPostgres = new EmbeddedPostgres({ port: 5433 })
    await embeddedPostgres.start()
    console.warn('Embedded Postgres started at', env.DATABASE_URL)
  }
}

function ensurePgPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: env.DATABASE_URL!,
      max: 20, // Maximum number of connections
      idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
      connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
    })
    // Handle pool errors
    pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err)
      exit(-1)
    })
  }
  return pool
}

function ensureLite(): PGlite {
  if (!lite) {
    const dir = env.PGLITE_DATA_DIR || resolve(cwd(), '.pglite')
    fs.mkdirSync(dir, { recursive: true })
    lite = new PGlite(`file:${dir}`)
  }
  return lite
}

/**
 * Initialize database connection pool
 */
export async function initPool(): Promise<Pool | PGlite> {
  if (!isPGliteEnabled()) {
    if (embeddedPostgresEnabled)
      await initEmbeddedPostgres()
    return ensurePgPool()
  }
  else {
    return ensureLite()
  }
}

/**
 * Initialize Drizzle ORM with connection pool
 */
export function initDb() {
  if (!dbPg && !dbLite) {
    if (!isPGliteEnabled()) {
      dbPg = drizzle(ensurePgPool(), { schema })
    }
    else {
      dbLite = drizzleLite(ensureLite(), { schema })
    }
  }
  return isPGliteEnabled()
    ? (dbLite ?? (dbLite = drizzleLite(ensureLite(), { schema })))
    : (dbPg ?? (dbPg = drizzle(ensurePgPool(), { schema })))
}

/**
 * Get database instance (singleton)
 */
export function useDrizzle() {
  return initDb()
}

/**
 * Get database instance by request (header/query can override)
 */
export function useDrizzleFromReq(req?: Request) {
  const variant = resolveVariantFromReq(req)
  if (variant === 'pglite')
    return dbLite ?? (dbLite = drizzleLite(ensureLite(), { schema }))
  return dbPg ?? (dbPg = drizzle(ensurePgPool(), { schema }))
}

/**
 * Health check for database connection
 */
export async function healthCheck(): Promise<{ status: 'healthy' | 'unhealthy', message: string }> {
  try {
    const db = useDrizzle()
    // Test connection with a simple query
    await db.execute(sql`SELECT 1 as test`)
    return { status: 'healthy', message: 'Database connection is working' }
  }
  catch (error) {
    console.error('Database health check failed:', error)
    return { status: 'unhealthy', message: `Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}` }
  }
}

/**
 * Run database migrations
 */
export async function runMigrations(): Promise<void> {
  try {
    if (!isPGliteEnabled()) {
      const d = drizzle(ensurePgPool(), { schema })
      console.warn('Running database migrations (Postgres)...')
      await migrate(d, { migrationsFolder: './drizzle' })
    }
    else {
      const d = drizzleLite(ensureLite(), { schema })
      console.warn('Running database migrations (PGlite)...')
      await migrateLite(d, { migrationsFolder: './drizzle' })
    }
    console.warn('Database migrations completed successfully')
  }
  catch (error) {
    console.error('Failed to run migrations:', error)
    throw error
  }
}

/**
 * Close database connections
 */
export async function closeConnections(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
    dbPg = null
    console.warn('Database connections closed')
  }
  if (lite && (lite as any).close) {
    await (lite as any).close()
    lite = null
    dbLite = null
    console.warn('PGlite closed')
  }
  if (embeddedPostgresEnabled && embeddedPostgres) {
    await embeddedPostgres.stop()
    embeddedPostgres = null
    console.warn('Embedded postgres stopped')
  }
}
