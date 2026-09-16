import type { Browser, BrowserContext, Page } from 'playwright'

import type { Config } from '../../config/types'

import fs from 'node:fs'

import { chromium } from 'playwright'

import { TWITTER_SESSION_FILE } from '../../constants'
import { logger } from '../../utils/logger'

export interface Context {
  browser: Browser
  context: BrowserContext
  page: Page
}

let ctxInstance: Context | null = null

export async function initBrowser(config: Config) {
  const browser = await chromium.launch({
    headless: config.browser.headless,
  })

  const context = await browser.newContext({
    storageState: await useSessionFileAsync(),
    userAgent: config.browser.userAgent,
    viewport: config.browser.viewport,
    bypassCSP: true,
  })

  context.setDefaultTimeout(config.browser.timeout || 30000)
  const page = await context.newPage()

  logger.main.log('Browser initialized')
  ctxInstance = { browser, context, page }
}

export async function useSessionFileAsync(): Promise<string> {
  const defaultSession = {
    cookies: [],
    origins: [],
  }

  async function createNewSessionFile(): Promise<void> {
    await fs.promises.writeFile(
      TWITTER_SESSION_FILE,
      JSON.stringify(defaultSession, null, 2),
    )
    logger.main.log(`Created new session file at: ${TWITTER_SESSION_FILE}`)
  }

  try {
    await fs.promises.access(TWITTER_SESSION_FILE)
  }
  catch (error) {
    logger.main.withError(error).error(`Session file not found at: ${TWITTER_SESSION_FILE}`)
    await createNewSessionFile()
  }

  return TWITTER_SESSION_FILE
}

export function useContext(): Context {
  if (!ctxInstance) {
    throw new Error('Context not initialized')
  }

  return ctxInstance
}
