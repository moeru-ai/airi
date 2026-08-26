import type { BrowserConfig } from '../types/browser'
import type { SearchOptions, TimelineOptions } from '../types/twitter'

import process from 'node:process'

/**
 * Complete configuration interface
 */
export interface Config {
  // Adapter configuration
  adapters: {
    airi?: {
      enabled: boolean
      token?: string
      url?: string
    }
    mcp?: {
      enabled: boolean
      port?: number
    }
  }

  // Browser configuration
  browser: BrowserConfig & {
    apiKey: string // API Key for Stagehand
    endpoint?: string // Optional Stagehand service endpoint
  }

  // Twitter API credentials
  credentials?: {
    accessToken?: string
    accessTokenSecret?: string
    apiKey?: string
    apiSecret?: string
  }

  // System configuration
  system: {
    concurrency: number
    logFormat?: 'json' | 'pretty'
    logLevel: 'debug' | 'error' | 'info' | 'verbose' | 'warn'
  }

  // Twitter configuration
  twitter: {
    defaultOptions?: {
      search?: SearchOptions
      timeline?: TimelineOptions
    }
  }
}

/**
 * Default configuration
 */
export function getDefaultConfig(): Config {
  // No longer parse cookies from environment variable
  // The auth service will load cookies from session file instead

  return {
    adapters: {
      airi: {
        enabled: process.env.ENABLE_AIRI === 'true',
        token: process.env.AIRI_TOKEN || '',
        url: process.env.AIRI_URL || 'http://localhost:3000',
      },
      mcp: {
        enabled: process.env.ENABLE_MCP === 'true',
        port: Number(process.env.MCP_PORT || 8080),
      },
    },
    browser: {
      apiKey: process.env.BROWSERBASE_API_KEY || '', // Move apiKey to browser config
      headless: process.env.BROWSER_HEADLESS === 'true',
      requestRetries: Number.parseInt(process.env.BROWSER_REQUEST_RETRIES || '2'),
      requestTimeout: Number.parseInt(process.env.BROWSER_REQUEST_TIMEOUT || '20000'),
      timeout: Number.parseInt(process.env.BROWSER_TIMEOUT || '30000'),
      userAgent: process.env.BROWSER_USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      viewport: {
        height: Number.parseInt(process.env.BROWSER_VIEWPORT_HEIGHT || '800'),
        width: Number.parseInt(process.env.BROWSER_VIEWPORT_WIDTH || '1280'),
      },
    },
    credentials: {
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
      apiKey: process.env.TWITTER_API_KEY,
      apiSecret: process.env.TWITTER_API_SECRET,
    },
    system: {
      concurrency: Number(process.env.CONCURRENCY || 1),
      logFormat: 'pretty',
      logLevel: 'debug',
    },
    twitter: {
      defaultOptions: {
        timeline: {
          count: 20,
          includeReplies: true,
          includeRetweets: true,
        },
      },
    },
  }
}
