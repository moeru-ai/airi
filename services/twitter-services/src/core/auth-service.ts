import type { BrowserAdapter } from '../adapters/browser-adapter'
import type { TwitterCredentials } from '../types/twitter'

import { logger } from '../utils/logger'
import { SELECTORS } from '../utils/selectors'

/**
 * Twitter Authentication Service
 * Handles login and session management
 */
export class TwitterAuthService {
  private browser: BrowserAdapter
  private isLoggedIn: boolean = false

  constructor(browser: BrowserAdapter) {
    this.browser = browser
  }

  /**
   * Login to Twitter - compatibility method for existing code
   * Prefers cookie-based login if cookies provided, otherwise redirects to manual login
   */
  async login(credentials: TwitterCredentials = {}): Promise<boolean> {
    // If cookies are provided, try to use them for login
    if (credentials.cookies && Object.keys(credentials.cookies).length > 0) {
      logger.auth.log('Cookies provided, attempting cookie-based login')
      const cookieLoginSuccess = await this.loginWithCookies(credentials.cookies)
      if (cookieLoginSuccess) {
        return true
      }
      // If cookie login fails, log the issue but continue to manual login
      logger.auth.log('Cookie login failed, falling back to manual login')
    }

    // Check for existing session first
    logger.auth.log('Checking for existing session before initiating manual login')
    const existingSession = await this.checkExistingSession()
    if (existingSession) {
      return true
    }

    // Fallback to manual login flow
    logger.auth.log('No existing session found, initiating manual login process')
    return this.initiateManualLogin()
  }

  /**
   * Verify if login was successful
   */
  private async verifyLogin(): Promise<boolean> {
    try {
      // Try multiple selectors to determine login status
      // First check for timeline which is definitive proof of being logged in
      try {
        await this.browser.waitForSelector(SELECTORS.HOME.TIMELINE, { timeout: 15000 })
        return true
      }
      catch {
        // If timeline selector fails, check for other indicators
      }

      // Check for profile button which appears when logged in
      try {
        const profileSelector = '[data-testid="AppTabBar_Profile_Link"]'
        await this.browser.waitForSelector(profileSelector, { timeout: 5000 })
        return true
      }
      catch {
        // Continue to other checks
      }

      // Check for login form to confirm NOT logged in
      try {
        const loginFormSelector = '[data-testid="loginForm"]'
        await this.browser.waitForSelector(loginFormSelector, { timeout: 3000 })
        // If login form is visible, we're definitely not logged in
        return false
      }
      catch {
        // Login form not found, could still be logged in or on another page
      }

      // If we got here, we couldn't definitively confirm login status
      // Check current URL for additional clues
      const currentUrl = await this.browser.executeScript<string>('return window.location.href')
      if (currentUrl.includes('/home')) {
        // On home page but couldn't find timeline - might still be loading
        return true
      }

      // Default to not logged in if we can't confirm
      return false
    }
    catch (error) {
      logger.auth.errorWithError('Error during login verification', error)
      return false
    }
  }

  /**
   * Check current login status
   */
  async checkLoginStatus(): Promise<boolean> {
    try {
      await this.browser.navigate('https://twitter.com/home')
      return await this.verifyLogin()
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
   * Export current session cookies
   * Can be used to save and reuse session later
   * @param format - The format of the returned cookies ('object' or 'string')
   */
  async exportCookies(format: 'object' | 'string' = 'object'): Promise<Record<string, string> | string> {
    try {
      if (format === 'string') {
        // Return raw document.cookie string
        const cookieString = await this.browser.executeScript<string>(`
          // Wrap in a function to allow return statement
          (() => {
            return document.cookie;
          })();
        `)
        return cookieString
      }
      else {
        // Return cookies as object
        const cookies = await this.browser.executeScript<Record<string, string>>(`
          // Wrap in a function to allow return statement
          (() => {
            return document.cookie.split(';')
              .map(cookie => cookie.trim().split('='))
              .reduce((acc, v) => {
                if (v.length < 2) return acc;
                acc[v[0]] = v[1];
                return acc;
              }, {});
          })();
        `)
        return cookies
      }
    }
    catch (error) {
      logger.auth.errorWithError('Error exporting cookies', error)
      return format === 'string' ? '' : {}
    }
  }

  /**
   * Login to Twitter using cookies
   */
  async loginWithCookies(cookies: Record<string, string>): Promise<boolean> {
    logger.auth.log(`Attempting to login to Twitter using ${Object.keys(cookies).length} cookies`)

    try {
      // Navigate to a Twitter page
      await this.browser.navigate('https://twitter.com')

      // Set cookies
      await this.browser.executeScript(`
        const cookies = ${JSON.stringify(cookies)};
        Object.entries(cookies).forEach(([name, value]) => {
          document.cookie = \`\${name}=\${value};domain=.twitter.com;path=/\`;
        });
      `)

      logger.auth.log(`Set ${Object.keys(cookies).length} cookies`)

      // Refresh page to apply cookies
      await this.browser.navigate('https://twitter.com/home')

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
            await this.browser.navigate('https://twitter.com/home')
            await new Promise(resolve => setTimeout(resolve, 3000))
          }
        }
        catch (error) {
          logger.auth.withError(error).debug(`Verification attempt ${attempt} failed`)
        }
      }

      if (loginSuccess) {
        logger.auth.log('Login with cookies successful')
        this.isLoggedIn = true

        // Try to refresh cookies to ensure they're up to date
        try {
          const freshCookies = await this.exportCookies('object')
          logger.auth.log(`Updated and exported ${typeof freshCookies === 'string' ? freshCookies.length : Object.keys(freshCookies).length} cookies`)
        }
        catch (error) {
          logger.auth.withError(error).debug('Failed to update cookies, but login was successful')
        }
      }
      else {
        logger.auth.warn('Login with cookies verification failed, cookies may be expired')
      }

      return loginSuccess
    }
    catch (error) {
      logger.auth.errorWithError('Error during cookie login process', error)
      this.isLoggedIn = false
      return false
    }
  }

  /**
   * Checks if there's an existing login session and retrieves it
   * This should be called before initiateManualLogin
   */
  async checkExistingSession(): Promise<boolean> {
    logger.auth.log('Checking for existing Twitter session')

    try {
      // Navigate to home page to check session
      await this.browser.navigate('https://twitter.com/home')

      // Verify if login is active
      const loginSuccess = await this.verifyLogin()

      if (loginSuccess) {
        logger.auth.log('Existing session found and valid')
        this.isLoggedIn = true

        // Export and save cookies
        try {
          const cookies = await this.exportCookies('object')
          logger.auth.log(`✅ Exported ${typeof cookies === 'string' ? cookies.length : Object.keys(cookies).length} cookies from existing session`)
        }
        catch (error) {
          logger.auth.errorWithError('Error exporting cookies from existing session', error)
        }
      }
      else {
        logger.auth.log('No valid session found')
      }

      return loginSuccess
    }
    catch (error) {
      logger.auth.errorWithError('Error checking session status', error)
      this.isLoggedIn = false
      return false
    }
  }

  /**
   * Initiates the manual login process by navigating to Twitter login page
   * and waits for user to complete the login process
   */
  async initiateManualLogin(): Promise<boolean> {
    logger.auth.log('Opening Twitter login page for manual login')

    try {
      // Store the current URL to detect navigation
      const initialUrl = await this.browser.executeScript<string>('return window.location.href')

      // Navigate to login page
      await this.browser.navigate('https://twitter.com/i/flow/login')

      // Wait for user to manually log in (detected by timeline presence)
      logger.auth.log('==============================================')
      logger.auth.log('Please log in to Twitter in the opened browser window')
      logger.auth.log('The system will wait for you to complete the login process')
      logger.auth.log('Cookies will be automatically saved after login')
      logger.auth.log('==============================================')

      // Poll for login success at intervals
      let attempts = 0
      const maxAttempts = 60 // 10 minutes (10 seconds * 60)
      let lastUrl = initialUrl

      while (attempts < maxAttempts) {
        attempts++

        try {
          // Get current URL to detect page changes
          const currentUrl = await this.browser.executeScript<string>('return window.location.href')

          // Check if URL has changed significantly - may indicate user interaction
          if (currentUrl !== lastUrl && !currentUrl.includes('/flow/login')) {
            logger.auth.log(`Detected page change: ${lastUrl} -> ${currentUrl}`)
            logger.auth.log('Attempting to navigate to home page and verify login status')

            // URL changed - try navigating to home to verify
            await this.browser.navigate('https://twitter.com/home')

            // Check if login was successful
            const isLoggedIn = await this.verifyLogin()
            if (isLoggedIn) {
              logger.auth.log('✅ Login successful! Exporting cookies...')

              // Export cookies for future use
              try {
                const cookies = await this.exportCookies('object')
                logger.auth.log(`✅ Successfully exported ${typeof cookies === 'string' ? cookies.length : Object.keys(cookies).length} cookies`)
              }
              catch (error) {
                logger.auth.errorWithError('Error exporting cookies', error)
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
            }
            catch (error) {
              logger.auth.errorWithError('Error exporting cookies', error)
            }

            this.isLoggedIn = true
            return true
          }
        }
        catch (error) {
          // Ignore errors during verification, continue polling
          logger.auth.debug(`Error during verification: ${error.message}`)
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
      logger.auth.errorWithError('Error during manual login process', error)
      return false
    }
  }
}
