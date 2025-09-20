import { execSync } from 'node:child_process'
import { exit } from 'node:process'

import { config } from 'dotenv'

import { closeConnections, healthCheck, runMigrations } from '../db/index.js'

// Load environment variables
config()

async function setupDatabase() {
  console.log('🚀 Setting up Memory Service Database...\n')

  try {
    // Step 1: Test database connection
    console.log('1️⃣ Testing database connection...')
    const health = await healthCheck()

    if (health.status === 'healthy') {
      console.log('✅ Database connection successful:', health.message)
    }
    else {
      console.error('❌ Database connection failed:', health.message)
      exit(1)
    }

    // Step 1.5: Generate fresh migrations
    console.log('\n1.5️⃣ Generating migration files...')
    try {
      execSync('pnpm db:generate', { stdio: 'inherit' })
      console.log('✅ Migration files generated')
    }
    catch (error) {
      console.error('❌ Failed to generate migrations:', error)
      exit(1)
    }

    // Step 2: Run migrations
    console.log('\n2️⃣ Running database migrations...')
    await runMigrations()
    console.log('✅ Database migrations completed')

    // Step 3: Final health check
    console.log('\n3️⃣ Final health check...')
    const finalHealth = await healthCheck()

    if (finalHealth.status === 'healthy') {
      console.log('✅ Database setup completed successfully!')
      console.log('🎉 Memory Service database is ready to use')
    }
    else {
      console.error('❌ Final health check failed:', finalHealth.message)
      exit(1)
    }
  }
  catch (error) {
    console.error('❌ Database setup failed:', error)
    exit(1)
  }
  finally {
    await closeConnections()
  }
}

// Run the setup
setupDatabase()
