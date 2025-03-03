import type { BrowserConfig } from '../types/browser'
import type { SearchOptions, TimelineOptions, TwitterCredentials } from '../types/twitter'

import process from 'node:process'

/**
 * 完整配置接口
 */
export interface Config {
  // 浏览器配置
  browser: BrowserConfig & {
    apiKey: string // 为 Stagehand 保留 API Key
    endpoint?: string // 可选的 Stagehand 服务端点
  }

  // Twitter 配置
  twitter: {
    credentials?: TwitterCredentials
    defaultOptions?: {
      timeline?: TimelineOptions
      search?: SearchOptions
    }
  }

  // 适配器配置
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

  // 系统配置
  system: {
    logLevel: 'error' | 'warn' | 'info' | 'verbose' | 'debug'
    logFormat?: 'json' | 'pretty'
    concurrency: number
  }
}

/**
 * 默认配置
 */
export const DEFAULT_CONFIG: Config = {
  browser: {
    apiKey: process.env.BROWSERBASE_API_KEY || '', // 将 apiKey 移到 browser 配置中
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
    logLevel: 'info',
    logFormat: process.env.NODE_ENV === 'development' ? 'pretty' : 'json',
    concurrency: Number(process.env.CONCURRENCY || 1),
  },
}
