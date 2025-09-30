/**
 * Browser Configuration Types
 */

export interface Viewport {
  width: number
  height: number
}

export interface BrowserConfig {
  headless: boolean
  userAgent: string
  viewport: Viewport
  timeout: number
  requestTimeout: number
  requestRetries: number
}
