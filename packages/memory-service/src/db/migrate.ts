#!/usr/bin/env tsx

import { exit } from 'node:process'

import { closeConnections, runMigrations } from './index.js'

async function migrate() {
  console.warn('🔄 Running database migrations...')

  try {
    await runMigrations()
    console.warn('✅ Migrations completed successfully')
  }
  catch (error) {
    console.error('❌ Migration failed:', error)
    exit(1)
  }
  finally {
    await closeConnections()
  }
}

// Run migrations
migrate()
