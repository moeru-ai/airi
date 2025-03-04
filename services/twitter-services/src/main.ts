import type { Browser, BrowserContext } from 'playwright'
import type { AiriAdapter } from './adapters/airi-adapter'
import type { MCPAdapter } from './adapters/mcp-adapter'

import process from 'node:process'
import { chromium } from 'playwright'

import { createDefaultConfig } from './config'
import { TwitterAuthService } from './core/auth-service'
import { TwitterTimelineService } from './core/timeline-service'
import { TwitterService } from './core/twitter-service'
import { initializeLogger, logger } from './utils/logger'

/**
 * Twitter service launcher class
 * Responsible for initializing and starting services
 */
export class TwitterServiceLauncher {
  private browser?: Browser
  private context?: BrowserContext
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

      // Initialize Playwright browser
      this.browser = await chromium.launch({
        headless: config.browser.headless,
      })

      // Create a browser context
      this.context = await this.browser.newContext({
        userAgent: config.browser.userAgent,
        viewport: config.browser.viewport,
        bypassCSP: true,
      })

      // Set default timeout for navigation and actions
      this.context.setDefaultTimeout(config.browser.timeout || 30000)

      // Create a page
      const page = await this.context.newPage()

      logger.main.log('Browser initialized')

      // Create service instances
      const authService = new TwitterAuthService(page, this.context)
      const timelineService = new TwitterTimelineService(page)

      // Create Twitter service with direct service dependencies
      this.twitterService = new TwitterService(authService, timelineService)

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
    if (this.context) {
      await this.context.close()
    }

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

// Ensure initialization only happens once
async function bootstrap() {
  // 1. First initialize logging system
  initializeLogger()

  // 2. Then create and start service
  const launcher = new TwitterServiceLauncher()

  try {
    await launcher.start()
  }
  catch (error) {
    logger.main.withError(error).error('Startup failed')
    process.exit(1)
  }

  // Set up process event handling
  process.on('unhandledRejection', (reason) => {
    logger.main.withError(reason).error('Unhandled Promise rejection:')
  })
}

// Start application
bootstrap()
