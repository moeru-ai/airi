/**
 * Browser Config Interface
 */
export interface BrowserConfig {
  headless?: boolean
  userAgent?: string
  viewport?: {
    width: number
    height: number
  }
  timeout?: number
  requestTimeout?: number // API request timeout
  requestRetries?: number // Request retries
  proxy?: string
}

/**
 * Element Handle Interface
 */
export interface ElementHandle {
  getText: () => Promise<string>
  getAttribute: (name: string) => Promise<string | null>
  click: () => Promise<void>
  type: (text: string) => Promise<void>
}

/**
 * Wait Options Interface
 */
export interface WaitOptions {
  timeout?: number
  visible?: boolean
  hidden?: boolean
}
