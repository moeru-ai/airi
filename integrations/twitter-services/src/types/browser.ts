/**
 * Browser Configuration Types
 */

export interface BrowserConfig {
  headless: boolean
  requestRetries: number
  requestTimeout: number
  timeout: number
  userAgent: string
  viewport: Viewport
}

export interface Viewport {
  height: number
  width: number
}
