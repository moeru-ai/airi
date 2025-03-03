import type { Buffer } from 'node:buffer'
import type { StagehandClientOptions } from '../browser/browserbase'
import type { BrowserConfig, ElementHandle, WaitOptions } from '../types/browser'
import type { BrowserAdapter } from './browser-adapter'

import { StagehandClient } from '../browser/browserbase'
import { errorToMessage } from '../utils/error'
import { logger } from '../utils/logger'

/**
 * Stagehand element handle implementation
 */
class StagehandElementHandle implements ElementHandle {
  private client: StagehandClient
  private selector: string

  constructor(client: StagehandClient, selector: string) {
    this.client = client
    this.selector = selector
  }

  async getText(): Promise<string> {
    return this.client.executeScript<string>(`
      document.querySelector('${this.selector}').textContent.trim()
    `)
  }

  async getAttribute(name: string): Promise<string | null> {
    return this.client.executeScript<string | null>(`
      document.querySelector('${this.selector}').getAttribute('${name}')
    `)
  }

  async click(): Promise<void> {
    await this.client.click(this.selector)
  }

  async type(text: string): Promise<void> {
    await this.client.type(this.selector, text)
  }
}

/**
 * Stagehand browser adapter implementation
 * Adapts the Stagehand API to a common browser interface
 */
export class StagehandBrowserAdapter implements BrowserAdapter {
  private client: StagehandClient

  constructor(apiKey: string, baseUrl?: string, options: Partial<StagehandClientOptions> = {}) {
    this.client = new StagehandClient({
      apiKey,
      baseUrl,
      ...options,
    })
  }

  async initialize(config: BrowserConfig): Promise<void> {
    try {
      await this.client.createSession({
        headless: config.headless,
        userAgent: config.userAgent,
        viewport: config.viewport,
      })
      logger.browser.withFields({
        headless: config.headless,
      }).log('Browser session created')
    }
    catch (error) {
      logger.browser.withError(error).error('Failed to initialize browser')
      throw new Error(`Unable to initialize browser: ${errorToMessage(error)}`)
    }
  }

  async navigate(url: string): Promise<void> {
    await this.client.navigate(url)
  }

  async executeScript<T>(script: string): Promise<T> {
    return this.client.executeScript<T>(script)
  }

  async waitForSelector(selector: string, options?: WaitOptions): Promise<void> {
    await this.client.waitForSelector(selector, {
      timeout: options?.timeout,
    })
  }

  async click(selector: string): Promise<void> {
    await this.client.click(selector)
  }

  async type(selector: string, text: string): Promise<void> {
    await this.client.type(selector, text)
  }

  async getText(selector: string): Promise<string> {
    return this.client.getText(selector)
  }

  async getElements(selector: string): Promise<ElementHandle[]> {
    // Get all matching element selectors
    const selectors = await this.executeScript<string[]>(`
      Array.from(document.querySelectorAll('${selector}')).map((el, i) => {
        const uniqueId = 'stagehand-' + Date.now() + '-' + i;
        el.setAttribute('data-stagehand-id', uniqueId);
        return '[data-stagehand-id="' + uniqueId + '"]';
      })
    `)

    // Create an ElementHandle for each match
    return selectors.map(selector => new StagehandElementHandle(this.client, selector))
  }

  // Add Stagehand specific methods
  async act(instruction: string): Promise<void> {
    await this.client.act(instruction)
  }

  async getScreenshot(): Promise<Buffer> {
    return this.client.getScreenshot()
  }

  async getAllCookies(): Promise<Array<{
    name: string
    value: string
    domain?: string
    path?: string
    expires?: number
    httpOnly?: boolean
    secure?: boolean
    sameSite?: 'Strict' | 'Lax' | 'None'
  }>> {
    return this.client.getAllCookies()
  }

  async setCookies(cookies: Array<{
    name: string
    value: string
    domain?: string
    path?: string
    expires?: number
    httpOnly?: boolean
    secure?: boolean
    sameSite?: 'Strict' | 'Lax' | 'None'
  }>): Promise<void> {
    return this.client.setCookies(cookies)
  }

  async close(): Promise<void> {
    await this.client.closeSession()
  }
}
