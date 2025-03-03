import type { Buffer } from 'node:buffer'
import type { Browser, Page } from 'playwright'
import type { z } from 'zod'

import { chromium } from 'playwright'

import { logger } from '../utils/logger'

/**
 * Stagehand client configuration options
 */
export interface StagehandClientOptions {
  apiKey: string
  baseUrl?: string
  timeout?: number
  headless?: boolean
  userAgent?: string
  viewport?: { width: number, height: number }
}

/**
 * Stagehand client
 * Implements browser automation using @browserbasehq/stagehand
 */
export class StagehandClient {
  private browser: Browser | null = null
  private page: Page | null = null
  private apiKey: string
  private options: Omit<StagehandClientOptions, 'apiKey'>

  constructor(options: StagehandClientOptions) {
    const {
      apiKey,
      baseUrl,
      timeout = 30000,
      headless = true,
      userAgent,
      viewport = { width: 1280, height: 800 },
    } = options

    this.apiKey = apiKey
    this.options = {
      baseUrl,
      timeout,
      headless,
      userAgent,
      viewport,
    }
  }

  /**
   * Create browser session
   */
  async createSession(options?: {
    headless?: boolean
    userAgent?: string
    viewport?: { width: number, height: number }
  }): Promise<string> {
    try {
      // Launch Playwright browser
      this.browser = await chromium.launch({
        headless: options?.headless ?? this.options.headless,
      })

      // Create context
      const context = await this.browser.newContext({
        userAgent: options?.userAgent ?? this.options.userAgent,
        viewport: options?.viewport ?? this.options.viewport,
        // Set any other required browser context options
      })

      // Create page
      this.page = await context.newPage()

      // Add Stagehand extension to page
      await this.setupStagehand()

      const sessionId = `session-${Date.now()}`
      logger.browser.withField('sessionId', sessionId).log('Browser session created successfully')
      return sessionId
    }
    catch (error) {
      logger.browser.errorWithError('Failed to create browser session', error)
      throw error
    }
  }

  /**
   * Set up Stagehand extension
   * This adds act, extract, observe methods to the page object
   */
  private async setupStagehand(): Promise<void> {
    if (!this.page) {
      throw new Error('No active page. Call createSession first.')
    }

    // In actual implementation, this would use Stagehand's API to set up the page object
    // This might involve page extension or injecting Stagehand functionality
    // Example code (actual usage would need to be adjusted based on Stagehand's documentation):
    //
    // import { extendPage } from '@browserbasehq/stagehand'
    // await extendPage(this.page, {
    //   apiKey: this.apiKey,
    //   // Other Stagehand options
    // })
  }

  /**
   * Navigate to specified URL
   */
  async navigate(url: string): Promise<void> {
    this.ensurePageExists()
    await this.page!.goto(url, { timeout: this.options.timeout })
  }

  /**
   * Execute JavaScript script
   */
  async executeScript<T>(script: string): Promise<T> {
    this.ensurePageExists()
    return await this.page!.evaluate(script) as T
  }

  /**
   * Use Stagehand's act API to perform operations
   */
  async act(instruction: string): Promise<void> {
    this.ensurePageExists()

    // In actual implementation, this would use Stagehand's act API
    // Example: await this.page!.act(instruction)

    // Temporary implementation, simulating act behavior with Playwright basics
    logger.browser.withField('instruction', instruction).log('Executing act instruction')

    // Simulate act behavior through simple methods
    // Actual implementation would use Stagehand's act API
    if (instruction.includes('click')) {
      const match = instruction.match(/click on the ['"](.+?)['"]/)
      if (match && match[1]) {
        await this.page!.getByText(match[1]).first().click()
      }
    }
  }

  /**
   * Use Stagehand's extract API to extract data
   */
  async extract<T extends z.ZodTypeAny>({
    instruction,
    _schema,
  }: {
    instruction: string
    _schema: T
  }): Promise<z.infer<T>> {
    this.ensurePageExists()

    // In actual implementation, this would use Stagehand's extract API
    // Example: return await this.page!.extract({ instruction, schema })

    // Temporary implementation, log instruction and return empty object
    logger.browser.withField('instruction', instruction).log('Executing extract instruction')

    // Simply return an empty object
    // Actual implementation would use Stagehand's extract API
    return {} as z.infer<T>
  }

  /**
   * Use Stagehand's observe API to observe page state
   */
  async observe(instruction: string): Promise<string> {
    this.ensurePageExists()

    // In actual implementation, this would use Stagehand's observe API
    // Example: return await this.page!.observe(instruction)

    // Temporary implementation, log instruction and return empty string
    logger.browser.withField('instruction', instruction).log('Executing observe instruction')

    // Simply return an empty string
    // Actual implementation would use Stagehand's observe API
    return ''
  }

  /**
   * Get page content
   */
  async getContent(): Promise<string> {
    this.ensurePageExists()
    return await this.page!.content()
  }

  /**
   * Wait for element to appear
   */
  async waitForSelector(selector: string, options: { timeout?: number } = {}): Promise<void> {
    this.ensurePageExists()
    await this.page!.waitForSelector(selector, {
      timeout: options.timeout || this.options.timeout,
    })
  }

  /**
   * Click element
   */
  async click(selector: string): Promise<void> {
    this.ensurePageExists()
    await this.page!.click(selector)
  }

  /**
   * Type text into input field
   */
  async type(selector: string, text: string): Promise<void> {
    this.ensurePageExists()
    // Clear input field first
    await this.page!.fill(selector, '')
    // Then type text
    await this.page!.fill(selector, text)
  }

  /**
   * Get element text content
   */
  async getText(selector: string): Promise<string> {
    this.ensurePageExists()
    const element = await this.page!.$(selector)
    if (!element) {
      throw new Error(`Element not found: ${selector}`)
    }
    return (await element.textContent() || '').trim()
  }

  /**
   * Get screenshot
   */
  async getScreenshot(): Promise<Buffer> {
    this.ensurePageExists()
    return await this.page!.screenshot() as Buffer
  }

  /**
   * Close session
   */
  async closeSession(): Promise<void> {
    if (this.browser) {
      await this.browser.close()
      this.browser = null
      this.page = null
      logger.browser.log('Browser session closed')
    }
  }

  /**
   * Ensure page exists
   */
  private ensurePageExists(): void {
    if (!this.page) {
      throw new Error('No active page. Call createSession first.')
    }
  }
}
