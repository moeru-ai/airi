import { env, exit } from 'node:process'

import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

import * as schema from './schema'

// Database connection pool
let pool: Pool
let db: ReturnType<typeof drizzle>

/**
 * Initialize database connection pool
 */
export function initPool() {
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

/**
 * Initialize Drizzle ORM with connection pool
 */
export function initDb() {
  if (!db) {
    const pool = initPool()
    db = drizzle(pool, { schema })
  }
  return db
}

/**
 * Get database instance (singleton)
 */
export function useDrizzle() {
  return initDb()
}

/**
 * Health check for database connection
 */
export async function healthCheck(): Promise<{ status: 'healthy' | 'unhealthy', message: string }> {
  try {
    const db = useDrizzle()

    // Test connection with a simple query
    await db.execute(sql`SELECT 1 as test`)

    return {
      status: 'healthy',
      message: 'Database connection is working',
    }
  }
  catch (error) {
    console.error('Database health check failed:', error)
    return {
      status: 'unhealthy',
      message: `Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

/**
 * Run database migrations
 */
export async function runMigrations(): Promise<void> {
  try {
    const pool = initPool()
    const db = drizzle(pool, { schema })

    console.warn('Running database migrations...')
    await migrate(db, { migrationsFolder: './drizzle' })
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
    console.warn('Database connections closed')
  }
}
