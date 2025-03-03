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
   * Login to Twitter
   */
  async login(credentials: TwitterCredentials): Promise<boolean> {
    logger.auth.withField('username', credentials.username.replace(/./g, '*')).log('Attempting to login to Twitter')

    try {
      // Navigate to login page
      await this.browser.navigate('https://twitter.com/i/flow/login')

      // Wait for and enter username
      await this.browser.waitForSelector(SELECTORS.LOGIN.USERNAME_INPUT)
      await this.browser.type(SELECTORS.LOGIN.USERNAME_INPUT, credentials.username)
      await this.browser.click(SELECTORS.LOGIN.NEXT_BUTTON)

      // Wait for and enter password
      await this.browser.waitForSelector(SELECTORS.LOGIN.PASSWORD_INPUT)
      await this.browser.type(SELECTORS.LOGIN.PASSWORD_INPUT, credentials.password)
      await this.browser.click(SELECTORS.LOGIN.LOGIN_BUTTON)

      // Verify if login was successful
      logger.auth.log('Login form submitted, verifying...')
      const loginSuccess = await this.verifyLogin()

      if (loginSuccess) {
        logger.auth.log('Login successful')
        this.isLoggedIn = true
      }
      else {
        logger.auth.warn('Login verification failed')
      }

      return loginSuccess
    }
    catch (error) {
      logger.auth.errorWithError('Error during login process', error)
      this.isLoggedIn = false
      return false
    }
  }

  /**
   * Verify if login was successful
   */
  private async verifyLogin(): Promise<boolean> {
    try {
      // Wait for home page content to load
      await this.browser.waitForSelector(SELECTORS.HOME.TIMELINE, { timeout: 10000 })
      return true
    }
    catch {
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
}
