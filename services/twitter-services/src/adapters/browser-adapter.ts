import type { Buffer } from 'node:buffer'
import type { BrowserConfig, ElementHandle, WaitOptions } from '../types/browser'

/**
 * Generic browser adapter interface
 * Defines the basic operations required for interacting with different browser backends
 */
export interface BrowserAdapter {
  /**
   * Initialize browser session
   */
  initialize: (config: BrowserConfig) => Promise<void>

  /**
   * Navigate to specified URL
   */
  navigate: (url: string) => Promise<void>

  /**
   * Execute JavaScript script
   */
  executeScript: <T>(script: string) => Promise<T>

  /**
   * Wait for element to appear
   */
  waitForSelector: (selector: string, options?: WaitOptions) => Promise<void>

  /**
   * Click element
   */
  click: (selector: string) => Promise<void>

  /**
   * Type text into input
   */
  type: (selector: string, text: string) => Promise<void>

  /**
   * Get element text content
   */
  getText: (selector: string) => Promise<string>

  /**
   * Get multiple element handles
   */
  getElements: (selector: string) => Promise<ElementHandle[]>

  /**
   * Get all cookies from the browser context
   * This includes HTTP_ONLY cookies that can't be accessed via document.cookie
   */
  getAllCookies: () => Promise<Array<{
    name: string
    value: string
    domain?: string
    path?: string
    expires?: number
    httpOnly?: boolean
    secure?: boolean
    sameSite?: 'Strict' | 'Lax' | 'None'
  }>>

  /**
   * Get screenshot
   */
  getScreenshot: () => Promise<Buffer>

  /**
   * Close browser session
   */
  close: () => Promise<void>
}
