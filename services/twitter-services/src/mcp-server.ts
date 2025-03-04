import process from 'node:process'
import * as dotenv from 'dotenv'

import { StagehandBrowserAdapter } from './adapters/browserbase-adapter'
import { MCPAdapter } from './adapters/mcp-adapter'
import { TwitterService } from './core/twitter-service'
import { logger } from './utils/logger'

// Load environment variables
dotenv.config()

/**
 * Development server entry point
 * Provides convenience features for development
 */
async function startDevServer() {
  // Create browser and Twitter service
  const browser = new StagehandBrowserAdapter(process.env.BROWSERBASE_API_KEY || '')
  await browser.initialize({
    headless: true,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  })

  const twitter = new TwitterService(browser)

  // Optional: If credentials are available, login
  if (process.env.TWITTER_USERNAME && process.env.TWITTER_PASSWORD) {
    const success = await twitter.login({
      username: process.env.TWITTER_USERNAME,
      password: process.env.TWITTER_PASSWORD,
    })

    if (success) {
      logger.main.log('✅ Successfully logged in Twitter')
    }
    else {
      logger.main.warn('⚠️ Twitter login failed')
    }
  }

  // Create and start MCP adapter
  const mcpAdapter = new MCPAdapter(twitter, 8080)
  await mcpAdapter.start()

  logger.main.log('🚀 Twitter MCP Dev Server started')

  // Handle exit
  process.on('SIGINT', async () => {
    logger.main.log('Shutting down server...')
    await mcpAdapter.stop()
    await browser.close()
    process.exit(0)
  })
}

// Execute
startDevServer().catch((error) => {
  logger.main.error('Failed to start dev server:', error)
  process.exit(1)
})
