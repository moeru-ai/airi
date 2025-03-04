import type { Browser, BrowserContext, Page } from 'playwright'
import type { AiriAdapter } from './adapters/airi-adapter'
import type { MCPAdapter } from './adapters/mcp-adapter'
import type { Config } from './config/types'

import process from 'node:process'
import { chromium } from 'playwright'

import { useConfigManager } from './config'
import { TwitterAuthService } from './core/auth-service'
import { TwitterTimelineService } from './core/timeline-service'
import { TwitterService } from './core/twitter-service'
import { initLogger, logger } from './utils/logger'

/**
 * Initialize browser and create page
 */
async function initBrowser(config: Config): Promise<{ browser: Browser, context: BrowserContext, page: Page }> {
  const browser = await chromium.launch({
    headless: config.browser.headless,
  })

  const context = await browser.newContext({
    userAgent: config.browser.userAgent,
    viewport: config.browser.viewport,
    bypassCSP: true,
  })

  context.setDefaultTimeout(config.browser.timeout || 30000)
  const page = await context.newPage()

  // Navigate to Twitter login page by default
  await page.goto('https://twitter.com/login')

  logger.main.log('Browser initialized')
  return { browser, context, page }
}

/**
 * Initialize Twitter service and login
 */
async function initTwitterService(page: Page, context: BrowserContext, _config: Config): Promise<TwitterService> {
  const authService = new TwitterAuthService(page, context)
  const timelineService = new TwitterTimelineService(page)
  const twitterService = new TwitterService(authService, timelineService)

  // Check if we have a saved session
  try {
    const sessionSuccess = await authService.checkExistingSession()
    if (sessionSuccess) {
      logger.main.log('Successfully loaded existing Twitter session')
    }
    else {
      // Instead of automatic login, navigate to login page
      logger.main.log('No valid session found, navigating to login page for manual login')
      await page.goto('https://twitter.com/login')
    }
  }
  catch (error) {
    logger.main.withError(error as Error).warn('Error checking session, navigating to login page')
    await page.goto('https://twitter.com/login')
  }

  // Start session monitoring to automatically save session when user logs in
  twitterService.startSessionMonitor()
  logger.main.log('Started automatic session monitoring')

  return twitterService
}

/**
 * Initialize adapters
 */
async function initAdapters(twitterService: TwitterService, config: Config): Promise<{ airi?: AiriAdapter, mcp?: MCPAdapter }> {
  const adapters: { airi?: AiriAdapter, mcp?: MCPAdapter } = {}

  if (config.adapters.airi?.enabled) {
    logger.main.log('Starting Airi adapter...')
    const { AiriAdapter } = await import('./adapters/airi-adapter')

    adapters.airi = new AiriAdapter(twitterService, {
      url: config.adapters.airi.url,
      token: config.adapters.airi.token,
      credentials: {},
    })

    await adapters.airi.start()
    logger.main.log('Airi adapter started')
  }

  if (config.adapters.mcp?.enabled) {
    logger.main.log('Starting MCP adapter...')
    const { MCPAdapter } = await import('./adapters/mcp-adapter')

    adapters.mcp = new MCPAdapter(
      twitterService,
      config.adapters.mcp.port,
    )

    await adapters.mcp.start()
    logger.main.log('MCP adapter started')
  }

  return adapters
}

/**
 * Clean up resources
 */
async function cleanup(
  adapters: { airi?: AiriAdapter, mcp?: MCPAdapter },
  context?: BrowserContext,
  browser?: Browser,
) {
  logger.main.log('Stopping Twitter service...')

  if (adapters.mcp) {
    await adapters.mcp.stop()
    logger.main.log('MCP adapter stopped')
  }

  if (context) {
    await context.close()
  }

  if (browser) {
    await browser.close()
    logger.main.log('Browser closed')
  }

  logger.main.log('Twitter service stopped')
}

/**
 * Set up process shutdown hooks
 */
function setupShutdownHooks(
  adapters: { airi?: AiriAdapter, mcp?: MCPAdapter },
  context?: BrowserContext,
  browser?: Browser,
) {
  const handleShutdown = async (signal: string) => {
    logger.main.log(`Received ${signal} signal...`)
    await cleanup(adapters, context, browser)
    process.exit(0)
  }

  process.on('SIGINT', () => handleShutdown('exit'))
  process.on('SIGTERM', () => handleShutdown('termination'))

  process.on('uncaughtException', async (error) => {
    logger.main.withError(error).error('Uncaught exception')
    await cleanup(adapters, context, browser)
    process.exit(1)
  })
}

// Start application
async function bootstrap() {
  // Initialize logging system
  initLogger()

  try {
    const config = useConfigManager().getConfig()
    logger.main.log('Starting Twitter service...')

    // Initialize core components
    const { browser, context, page } = await initBrowser(config)
    const twitterService = await initTwitterService(page, context, config)
    const adapters = await initAdapters(twitterService, config)

    // Set up shutdown hooks
    setupShutdownHooks(adapters, context, browser)

    logger.main.log('Twitter service successfully started!')
  }
  catch (error) {
    logger.main.withError(error).error('Startup failed')
    process.exit(1)
  }

  // Handle unhandled rejections
  process.on('unhandledRejection', (reason) => {
    logger.main.withError(reason).error('Unhandled Promise rejection:')
  })
}

bootstrap()
