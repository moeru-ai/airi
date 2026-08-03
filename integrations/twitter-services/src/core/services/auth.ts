import type { Cookie } from 'playwright'

import type { TwitterService } from '../../types/services'
import type { Context } from '../browser/context'

import { TWITTER_LOGIN_URL, TWITTER_SESSION_FILE } from '../../constants'
import { logger } from '../../utils/logger'

export function useTwitterAuthServices(ctx: Context): TwitterService {
  function hasAuthToken(cookies: Cookie[]) {
    return cookies.some(cookie => cookie.name === 'auth_token')
  }

  function storeSession() {
    return ctx.context.storageState({ path: TWITTER_SESSION_FILE })
  }

  async function attemptLogin(): Promise<boolean> {
    try {
      // Navigate to Twitter login page
      await ctx.page.goto(TWITTER_LOGIN_URL)

      // Get current cookies to check login status
      const cookies = await ctx.context.cookies()
      if (hasAuthToken(cookies)) {
        logger.auth.log('Already logged in')
        storeSession()
        return true
      }

      // Monitor page navigation events
      ctx.page.once('framenavigated', async (frame) => {
        if (frame === ctx.page.mainFrame()) {
          const currentUrl = frame.url()
          logger.auth.log(`Page navigated to: ${currentUrl}`)

          // Check if navigation led to successful login
          const cookies = await ctx.context.cookies()
          if (hasAuthToken(cookies)) {
            logger.auth.log('Login successful')
            storeSession()
            return true
          }
        }
      })

      logger.auth.log('Waiting for login form')
      // Wait for login form to be filled and submitted
      await ctx.page.waitForSelector('input[autocomplete="username"]')
      logger.auth.log('Login form detected')
      return false
    }
    catch (error) {
      logger.auth.errorWithError('Error during login attempt', error)
      return false
    }
  }

  return {
    attemptLogin,
    hasAuthToken,
  }
}
