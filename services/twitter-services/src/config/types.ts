import type { BrowserConfig } from '../types/browser'
import type { SearchOptions, TimelineOptions, TwitterCredentials } from '../types/twitter'

import process from 'node:process'

/**
 * Complete configuration interface
 */
export interface Config {
  // Browser configuration
  browser: BrowserConfig & {
    apiKey: string // API Key for Stagehand
    endpoint?: string // Optional Stagehand service endpoint
  }

  // Twitter configuration
  twitter: {
    credentials?: TwitterCredentials
    defaultOptions?: {
      timeline?: TimelineOptions
      search?: SearchOptions
    }
  }

  // Adapter configuration
  adapters: {
    airi?: {
      url?: string
      token?: string
      enabled: boolean
    }
    mcp?: {
      port?: number
      enabled: boolean
    }
  }

  // System configuration
  system: {
    logLevel: 'error' | 'warn' | 'info' | 'verbose' | 'debug'
    logFormat?: 'json' | 'pretty'
    concurrency: number
  }
}

/**
 * Default configuration
 */
export function getDefaultConfig(): Config {
  return {
    browser: {
      apiKey: process.env.BROWSERBASE_API_KEY || '', // Move apiKey to browser config
      headless: true,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      viewport: {
        width: 1280,
        height: 800,
      },
      timeout: 30000,
      requestTimeout: 20000,
      requestRetries: 2,
    },
    twitter: {
      credentials: {
        username: process.env.TWITTER_USERNAME || '',
        password: process.env.TWITTER_PASSWORD || '',
      },
      defaultOptions: {
        timeline: {
          count: 20,
          includeReplies: true,
          includeRetweets: true,
        },
      },
    },
    adapters: {
      airi: {
        url: process.env.AIRI_URL || 'http://localhost:3000',
        token: process.env.AIRI_TOKEN || '',
        enabled: process.env.ENABLE_AIRI === 'true',
      },
      mcp: {
        port: Number(process.env.MCP_PORT || 8080),
        enabled: process.env.ENABLE_MCP === 'true' || true,
      },
    },
    system: {
      logLevel: 'debug',
      logFormat: 'pretty',
      concurrency: Number(process.env.CONCURRENCY || 1),
    },
  }
}
