import type { BrowserContext, Cookie, Page } from 'playwright'

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { logger } from '../utils/logger'
import { SELECTORS } from '../utils/selectors'

/**
 * Playwright storage state type definition
 */
interface StorageState {
  cookies: Cookie[]
  origins: {
    origin: string
    localStorage: {
      name: string
      value: string
    }[]
  }[]
  path?: string
}

/**
 * Simple session manager for storing and retrieving browser session data
 */
class SessionManager {
  private sessionPath: string

  constructor() {
    this.sessionPath = path.join(process.cwd(), 'data', 'twitter-session.json')
  }

  /**
   * Load storage state from disk
   */
  async loadStorageState(): Promise<StorageState | null> {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.sessionPath)
      await fs.mkdir(dir, { recursive: true })

      // Check if file exists
      try {
        await fs.access(this.sessionPath)
      }
      catch {
        // File doesn't exist
        return null
      }

      // Read file
      const data = await fs.readFile(this.sessionPath, 'utf-8')
      return JSON.parse(data) as StorageState
    }
    catch (error) {
      logger.auth.withError(error as Error).warn('Failed to load session data')
      return null
    }
  }

  /**
   * Save storage state to disk
   */
  async saveStorageState(state: StorageState): Promise<void> {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.sessionPath)
      await fs.mkdir(dir, { recursive: true })

      // Write to file
      await fs.writeFile(this.sessionPath, JSON.stringify(state, null, 2))
    }
    catch (error) {
      logger.auth.withError(error as Error).warn('Failed to save session data')
    }
  }
}

// Singleton instance
const sessionManager = new SessionManager()

/**
 * Twitter Authentication Service
 * Handles login and session management
 */
export class TwitterAuthService {
  private page: Page
  private context: BrowserContext
  private isLoggedIn: boolean = false

  constructor(page: Page, context: BrowserContext) {
    this.page = page
    this.context = context
  }

  /**
   * Login to Twitter - simplified method that only tries to use session file
   * Users are expected to manually login and save the session
   */
  async login(): Promise<boolean> {
    logger.auth.log('Starting Twitter login process')

    try {
      // Try to login with existing session first
      logger.auth.log('Attempting to load session from file')
      const sessionSuccess = await this.checkExistingSession()

      if (sessionSuccess) {
        logger.auth.log('Successfully logged in with session file')
        return true
      }

      // Log session failure but don't attempt automatic login
      logger.auth.log('No valid session found, manual login is required')
      return false
    }
    catch (error: unknown) {
      logger.auth.withError(error as Error).error('Login process failed')
      this.isLoggedIn = false
      return false
    }
  }

  /**
   * Verify if login was successful
   */
  private async verifyLogin(): Promise<boolean> {
    try {
      // Try multiple selectors to determine login status
      // First check for timeline which is definitive proof of being logged in
      try {
        await this.page.waitForSelector(SELECTORS.HOME.TIMELINE, { timeout: 15000 })

        // Login verification successful - automatically save session
        this.isLoggedIn = true
        try {
          await this.saveCurrentSession()
          logger.auth.log('✅ Auto-saved session after successful login verification')
        }
        catch (error) {
          logger.auth.withError(error as Error).warn('Failed to auto-save session')
        }

        return true
      }
      catch {
        // If timeline selector fails, check for other indicators
      }

      // Check for profile button which appears when logged in
      try {
        const profileSelector = '[data-testid="AppTabBar_Profile_Link"]'
        await this.page.waitForSelector(profileSelector, { timeout: 5000 })

        // Profile link found - automatically save session
        this.isLoggedIn = true
        try {
          await this.saveCurrentSession()
          logger.auth.log('✅ Auto-saved session after finding profile link')
        }
        catch (error) {
          logger.auth.withError(error as Error).warn('Failed to auto-save session')
        }

        return true
      }
      catch {
        // Continue to other checks
      }

      // Check for login form to confirm NOT logged in
      try {
        const loginFormSelector = '[data-testid="loginForm"]'
        await this.page.waitForSelector(loginFormSelector, { timeout: 3000 })
        // If login form is visible, we're definitely not logged in
        return false
      }
      catch {
        // Login form not found, could still be logged in or on another page
      }

      // If we got here, we couldn't definitively confirm login status
      // Check current URL for additional clues
      const currentUrl = await this.page.evaluate<string>(`
        (() => {
          return window.location.href;
        })()
      `)
      if (currentUrl.includes('/home')) {
        // On home page but couldn't find timeline - might still be loading
        return true
      }

      // Default to not logged in if we can't confirm
      return false
    }
    catch (error) {
      logger.auth.withError(error as Error).error('Error during login verification')
      return false
    }
  }

  /**
   * Check current login status
   */
  async checkLoginStatus(): Promise<boolean> {
    try {
      await this.page.goto('https://x.com/home')
      const isLoggedIn = await this.verifyLogin()

      // If already logged in, update state and automatically save session
      if (isLoggedIn && !this.isLoggedIn) {
        this.isLoggedIn = true
        try {
          await this.saveCurrentSession()
          logger.auth.log('✅ Auto-saved session during status check')
        }
        catch (error) {
          logger.auth.withError(error as Error).warn('Failed to auto-save session during status check')
        }
      }

      return isLoggedIn
    }
    catch {
      return false
    }
  }

  /**
   * Get login status
   */
  isAuthenticated(): boolean {
    return this.isLoggedIn
  }

  /**
   * Export current cookies
   * @param format Export format, either 'object' or 'string'
   */
  async exportCookies(format: 'object' | 'string' = 'object'): Promise<Record<string, string> | string> {
    try {
      // Get all cookies from browser
      const allCookies = await this.context.cookies()

      if (format === 'string') {
        // Convert cookie objects to string format
        const cookieString = allCookies
          .map(cookie => `${cookie.name}=${cookie.value}`)
          .join('; ')

        logger.auth.log(`Exported ${allCookies.length} cookies as string`)
        return cookieString
      }
      else {
        // Convert to object format
        const cookiesObj = allCookies.reduce<Record<string, string>>((acc, cookie) => {
          acc[cookie.name] = cookie.value
          return acc
        }, {})

        logger.auth.log(`Exported ${Object.keys(cookiesObj).length} cookies as object`)
        return cookiesObj
      }
    }
    catch (error) {
      logger.auth.withError(error as Error).error('Failed to export cookies')
      if (format === 'string') {
        return ''
      }
      return {}
    }
  }

  /**
   * Login to Twitter using cookies
   */
  async loginWithCookies(cookies: Record<string, string>): Promise<boolean> {
    logger.auth.log(`Attempting to login to Twitter using ${Object.keys(cookies).length} cookies`)

    try {
      // Navigate to a Twitter page
      await this.page.goto('https://x.com')

      // Convert cookies object to array format required by setCookies
      const cookieArray = Object.entries(cookies).map(([name, value]) => ({
        name,
        value,
        domain: '.x.com',
        path: '/',
      }))

      // Set cookies using the browser adapter's API that can set HTTP_ONLY cookies
      await this.context.addCookies(cookieArray)

      logger.auth.log(`Set ${cookieArray.length} cookies via browser API`)

      // Refresh page to apply cookies
      await this.page.goto('https://x.com/home')

      // Verify if login was successful - try multiple times with longer timeout
      logger.auth.log('Cookies set, verifying login status...')

      // Try multiple times with increasing timeouts for verification
      // Twitter might be slow to respond or need multiple page refreshes
      let loginSuccess = false
      const verificationAttempts = 3

      for (let attempt = 1; attempt <= verificationAttempts; attempt++) {
        try {
          logger.auth.log(`Verification attempt ${attempt}/${verificationAttempts}`)
          loginSuccess = await this.verifyLogin()

          if (loginSuccess) {
            break
          }
          else if (attempt < verificationAttempts) {
            // If not successful but not last attempt, refresh page and wait
            logger.auth.log('Refreshing page and trying again...')
            await this.page.goto('https://x.com/home')
            await new Promise(resolve => setTimeout(resolve, 3000))
          }
        }
        catch (error: unknown) {
          logger.auth.withError(error as Error).debug(`Verification attempt ${attempt} failed`)
        }
      }

      if (loginSuccess) {
        logger.auth.log('Login with cookies successful')
        this.isLoggedIn = true

        // Try to refresh cookies to ensure they're up to date
        try {
          await this.saveCurrentSession()
          logger.auth.log('✅ Session saved to file')
        }
        catch (error: unknown) {
          logger.auth.withError(error as Error).debug('Failed to save session, but login was successful')
        }
      }
      else {
        logger.auth.warn('Login with cookies verification failed, cookies may be expired')
      }

      return loginSuccess
    }
    catch (error: unknown) {
      logger.auth.withError(error as Error).error('Error during cookie login process')
      this.isLoggedIn = false
      return false
    }
  }

  /**
   * Attempt to login with an existing session if available
   */
  async checkExistingSession(): Promise<boolean> {
    try {
      // Get the session data
      const sessionData = await sessionManager.loadStorageState()

      if (!sessionData || !sessionData.cookies || sessionData.cookies.length === 0) {
        logger.auth.log('No valid session data found')
        return false
      }

      logger.auth.log(`Found session file with ${sessionData.cookies.length} cookies, attempting login`)

      // Login with the session data
      return await this.loginWithSessionData(sessionData)
    }
    catch (error) {
      logger.auth.withError(error as Error).warn('Error checking existing session')
      return false
    }
  }

  /**
   * Initiate manual login process with username and password
   * @param username Twitter username or email
   * @param password Twitter password
   */
  async initiateManualLogin(username?: string, password?: string): Promise<boolean> {
    logger.auth.log('Initiating manual login process')

    try {
      // Navigate to login page
      await this.page.goto('https://x.com/login')

      // Wait for login form to appear and enter credentials
      try {
        // Wait for username input
        await this.page.waitForSelector(SELECTORS.LOGIN.USERNAME_INPUT, { timeout: 10000 })

        // Use provided credentials if available, otherwise fall back to env vars
        const loginUsername = username || process.env.TWITTER_USERNAME
        const loginPassword = password || process.env.TWITTER_PASSWORD

        if (!loginUsername || !loginPassword) {
          logger.auth.warn('Missing Twitter credentials, manual login cannot proceed')
          return false
        }

        // Enter username
        await this.page.fill(SELECTORS.LOGIN.USERNAME_INPUT, loginUsername)
        logger.auth.debug('Username entered')

        // Click next button
        await this.page.click(SELECTORS.LOGIN.NEXT_BUTTON)
        logger.auth.debug('Next button clicked')

        // Wait for password input
        await this.page.waitForSelector(SELECTORS.LOGIN.PASSWORD_INPUT, { timeout: 10000 })

        // Enter password
        await this.page.fill(SELECTORS.LOGIN.PASSWORD_INPUT, loginPassword)
        logger.auth.debug('Password entered')

        // Click login button
        await this.page.click(SELECTORS.LOGIN.LOGIN_BUTTON)
        logger.auth.debug('Login button clicked')
      }
      catch (error) {
        logger.auth.withError(error as Error).error('Error during manual login process')
        return false
      }

      // Wait for login success at intervals
      let attempts = 0
      const maxAttempts = 60 // 10 minutes (10 seconds * 60)
      let lastUrl = await this.page.evaluate<string>(`
        (() => {
          return window.location.href;
        })()
      `)

      while (attempts < maxAttempts) {
        attempts++

        try {
          // Get current URL to detect page changes
          const currentUrl = await this.page.evaluate<string>(`
            (() => {
              return window.location.href;
            })()
          `)

          // Check if URL has changed significantly - may indicate user interaction
          if (currentUrl !== lastUrl && !currentUrl.includes('/flow/login')) {
            logger.auth.log(`Detected page change: ${lastUrl} -> ${currentUrl}`)
            logger.auth.log('Attempting to navigate to home page and verify login status')

            // URL changed - try navigating to home to verify
            await this.page.goto('https://x.com/home')

            // Check if login was successful
            const isLoggedIn = await this.verifyLogin()
            if (isLoggedIn) {
              logger.auth.log('✅ Login successful! Exporting cookies...')

              // Export cookies for future use
              try {
                const cookies = await this.exportCookies('object')
                logger.auth.log(`✅ Successfully exported ${typeof cookies === 'string' ? cookies.length : Object.keys(cookies).length} cookies`)

                // Save the current session to file
                await this.saveCurrentSession()
                logger.auth.log('✅ Session saved to file')
              }
              catch (error) {
                logger.auth.withError(error as Error).error('Error exporting cookies')
              }

              this.isLoggedIn = true
              return true
            }

            // Update last URL
            lastUrl = currentUrl
          }

          // Also try direct login verification
          const isLoggedIn = await this.verifyLogin()
          if (isLoggedIn) {
            logger.auth.log('✅ Login successful! Exporting cookies...')

            // Export cookies for future use
            try {
              const cookies = await this.exportCookies('object')
              logger.auth.log(`✅ Successfully exported ${typeof cookies === 'string' ? cookies.length : Object.keys(cookies).length} cookies`)

              // Save the current session to file
              await this.saveCurrentSession()
              logger.auth.log('✅ Session saved to file')
            }
            catch (error) {
              logger.auth.withError(error as Error).error('Error exporting cookies')
            }

            this.isLoggedIn = true
            return true
          }
        }
        catch (error) {
          // Ignore errors during verification, continue polling
          logger.auth.debug(`Error during verification: ${(error as Error).message}`)
        }

        // Wait 10 seconds before checking again
        await new Promise(resolve => setTimeout(resolve, 10000))

        // Only log every 6 attempts (1 minute) to reduce noise
        if (attempts % 6 === 0) {
          logger.auth.log(`Still waiting for login... (${Math.floor(attempts / 6)} minutes elapsed)`)
        }
      }

      logger.auth.warn('⚠️ Manual login timeout exceeded')
      return false
    }
    catch (error) {
      logger.auth.withError(error as Error).error('Error during manual login process')
      return false
    }
  }

  /**
   * Save the current session to a file
   */
  async saveCurrentSession(): Promise<void> {
    try {
      // Get the storage state directly from context
      const storageState = await this.context.storageState()

      // Save the session using the session manager
      await sessionManager.saveStorageState(storageState)

      logger.auth.log('✅ Session saved to file using browserContext.storageState()')
    }
    catch (error) {
      logger.auth.withError(error as Error).warn('Failed to save session')
    }
  }

  /**
   * Login with stored session data
   */
  private async loginWithSessionData(sessionData: StorageState): Promise<boolean> {
    try {
      // Extract cookies from session data
      const { cookies } = sessionData

      // Create array of cookie objects for the browser
      const cookieArray = cookies.map(cookie => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
      }))

      // Set cookies using the browser adapter's API
      await this.context.addCookies(cookieArray)
      logger.auth.log(`Set ${cookieArray.length} cookies from session file`)

      // Set localStorage if available
      if (sessionData.origins && sessionData.origins.length > 0) {
        await this.context.storageState(sessionData)
        logger.auth.log(`Set localStorage for ${sessionData.origins.length} origins`)
      }

      // Navigate to home to verify login
      await this.page.goto('https://x.com/home')

      // Verify if login was successful
      const loginSuccess = await this.verifyLogin()

      if (loginSuccess) {
        this.isLoggedIn = true
        logger.auth.log('✅ Successfully logged in with session data')
      }
      else {
        logger.auth.warn('⚠️ Session data login failed verification')
      }

      return loginSuccess
    }
    catch (error) {
      logger.auth.withError(error as Error).error('Failed to login with session data')
      return false
    }
  }
}
