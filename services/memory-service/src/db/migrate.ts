#!/usr/bin/env tsx

import { exit } from 'node:process'

import { config } from 'dotenv'

import { closeConnections, runMigrations } from './index.js'

// Load environment variables
config()

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
