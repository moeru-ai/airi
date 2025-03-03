import type { BrowserAdapter } from '../adapters/browser-adapter'
import type { TwitterCredentials } from '../types/twitter'

import { logger } from '../utils/logger'
import { SELECTORS } from '../utils/selectors'

/**
 * Twitter 认证服务
 * 处理登录和会话管理
 */
export class TwitterAuthService {
  private browser: BrowserAdapter
  private isLoggedIn: boolean = false

  constructor(browser: BrowserAdapter) {
    this.browser = browser
  }

  /**
   * 登录到 Twitter
   */
  async login(credentials: TwitterCredentials): Promise<boolean> {
    logger.auth.withField('username', credentials.username.replace(/./g, '*')).log('尝试登录 Twitter')

    try {
      // 导航到登录页
      await this.browser.navigate('https://twitter.com/i/flow/login')

      // 等待并输入用户名
      await this.browser.waitForSelector(SELECTORS.LOGIN.USERNAME_INPUT)
      await this.browser.type(SELECTORS.LOGIN.USERNAME_INPUT, credentials.username)
      await this.browser.click(SELECTORS.LOGIN.NEXT_BUTTON)

      // 等待并输入密码
      await this.browser.waitForSelector(SELECTORS.LOGIN.PASSWORD_INPUT)
      await this.browser.type(SELECTORS.LOGIN.PASSWORD_INPUT, credentials.password)
      await this.browser.click(SELECTORS.LOGIN.LOGIN_BUTTON)

      // 验证登录是否成功
      logger.auth.log('登录表单已填写完成，提交中...')
      const loginSuccess = await this.verifyLogin()

      if (loginSuccess) {
        logger.auth.log('登录成功')
        this.isLoggedIn = true
      }
      else {
        logger.auth.warn('登录验证失败')
      }

      return loginSuccess
    }
    catch (error) {
      logger.auth.errorWithError('登录过程中发生错误', error)
      this.isLoggedIn = false
      return false
    }
  }

  /**
   * 验证是否已成功登录
   */
  private async verifyLogin(): Promise<boolean> {
    try {
      // 等待主页内容加载
      await this.browser.waitForSelector(SELECTORS.HOME.TIMELINE, { timeout: 10000 })
      return true
    }
    catch {
      return false
    }
  }

  /**
   * 检查当前是否已登录
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
   * 获取登录状态
   */
  isAuthenticated(): boolean {
    return this.isLoggedIn
  }
}
