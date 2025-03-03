import type { AiriAdapter } from './adapters/airi-adapter'
import type { StagehandBrowserAdapter } from './adapters/browserbase-adapter'
import type { MCPAdapter } from './adapters/mcp-adapter'

import process from 'node:process'

import { createDefaultConfig } from './config'
import { TwitterService } from './core/twitter-service'
import { logger } from './utils/logger'

/**
 * Twitter service launcher class
 * Responsible for initializing and starting services
 */
export class TwitterServiceLauncher {
  private browser?: StagehandBrowserAdapter
  private twitterService?: TwitterService
  private airiAdapter?: AiriAdapter
  private mcpAdapter?: MCPAdapter

  /**
   * Start Twitter service
   */
  async start() {
    try {
      // Load configuration
      const configManager = createDefaultConfig()
      const config = configManager.getConfig()

      logger.main.log('Starting Twitter service...')

      // Initialize browser
      // Import handling
      const { StagehandBrowserAdapter } = await import('./adapters/browserbase-adapter')
      this.browser = new StagehandBrowserAdapter(
        config.browser.apiKey,
        config.browser.endpoint,
        {
          timeout: config.browser.requestTimeout,
          // retries: config.browser.requestRetries,
        },
      )

      await this.browser.initialize(config.browser)
      logger.main.log('Browser initialized')

      // Create Twitter service
      this.twitterService = new TwitterService(this.browser)

      // Try to log in
      if (config.twitter.credentials) {
        const success = await this.twitterService.login(config.twitter.credentials)
        if (success) {
          logger.main.log('Successfully logged into Twitter')
        }
        else {
          logger.main.error('Twitter login failed!')
        }
      }

      // Start enabled adapters
      if (config.adapters.airi?.enabled) {
        logger.main.log('Starting Airi adapter...')
        const { AiriAdapter } = await import('./adapters/airi-adapter')

        this.airiAdapter = new AiriAdapter(this.twitterService, {
          url: config.adapters.airi.url,
          token: config.adapters.airi.token,
          credentials: config.twitter.credentials!,
        })

        await this.airiAdapter.start()
        logger.main.log('Airi adapter started')
      }

      if (config.adapters.mcp?.enabled) {
        logger.main.log('Starting MCP adapter...')
        const { MCPAdapter } = await import('./adapters/mcp-adapter')

        this.mcpAdapter = new MCPAdapter(
          this.twitterService,
          config.adapters.mcp.port,
        )

        await this.mcpAdapter.start()
        logger.main.log('MCP adapter started')
      }

      logger.main.log('Twitter service successfully started!')

      // Set up shutdown hooks
      this.setupShutdownHooks()
    }
    catch (error) {
      logger.main.withError(error).error('Failed to start Twitter service')
    }
  }

  /**
   * Stop service
   */
  async stop() {
    logger.main.log('Stopping Twitter service...')

    // Stop MCP adapter
    if (this.mcpAdapter) {
      await this.mcpAdapter.stop()
      logger.main.log('MCP adapter stopped')
    }

    // Close browser
    if (this.browser) {
      await this.browser.close()
      logger.main.log('Browser closed')
    }

    logger.main.log('Twitter service stopped')
  }

  /**
   * Set up shutdown hooks
   */
  private setupShutdownHooks() {
    // Handle process exit
    process.on('SIGINT', async () => {
      logger.main.log('Received exit signal...')
      await this.stop()
      process.exit(0)
    })

    process.on('SIGTERM', async () => {
      logger.main.log('Received termination signal...')
      await this.stop()
      process.exit(0)
    })

    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      logger.main.withError(error).error('Uncaught exception')
      await this.stop()
      process.exit(1)
    })
  }
}
