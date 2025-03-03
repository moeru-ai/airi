import { Buffer } from 'node:buffer'

import { createApiClient } from '../utils/api'
import { logger } from '../utils/logger'

/**
 * BrowserBase API 客户端配置选项
 */
export interface BrowserBaseClientOptions {
  apiKey: string
  baseUrl?: string
  timeout?: number
  retries?: number
}

/**
 * BrowserBase API 客户端
 * 封装 BrowserBase 的 REST API
 */
export class BrowserBaseClient {
  private sessionId: string | null = null
  private api: ReturnType<typeof createApiClient>

  constructor(options: BrowserBaseClientOptions) {
    const { apiKey, baseUrl = 'https://api.browserbase.com', timeout = 30000, retries = 1 } = options

    // 创建 API 客户端
    this.api = createApiClient(baseUrl, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout,
      retry: retries,
    })
  }

  /**
   * 创建浏览器会话
   */
  async createSession(options: {
    headless?: boolean
    userAgent?: string
    viewport?: { width: number, height: number }
  }): Promise<string> {
    try {
      const data = await this.api('/v1/sessions', {
        method: 'POST',
        body: options,
      })

      this.sessionId = data.sessionId
      logger.browser.withField('sessionId', this.sessionId).log('创建浏览器会话成功')
      return this.sessionId || ''
    }
    catch (error) {
      logger.browser.errorWithError('创建浏览器会话失败', error)
      throw error
    }
  }

  /**
   * 导航到指定URL
   */
  async navigate(url: string): Promise<void> {
    this.ensureSessionExists()

    await this.api(`/v1/sessions/${this.sessionId}/url`, {
      method: 'POST',
      body: { url },
    })
  }

  /**
   * 执行JavaScript脚本
   */
  async executeScript<T>(script: string): Promise<T> {
    this.ensureSessionExists()

    const data = await this.api(`/v1/sessions/${this.sessionId}/execute`, {
      method: 'POST',
      body: { script },
    })

    return data.result
  }

  /**
   * 获取页面内容
   */
  async getContent(): Promise<string> {
    return this.executeScript<string>('document.documentElement.outerHTML')
  }

  /**
   * 等待元素出现
   */
  async waitForSelector(selector: string, options: { timeout?: number } = {}): Promise<void> {
    this.ensureSessionExists()

    await this.api(`/v1/sessions/${this.sessionId}/wait`, {
      method: 'POST',
      body: { selector, timeout: options.timeout },
    })
  }

  /**
   * 点击元素
   */
  async click(selector: string): Promise<void> {
    this.ensureSessionExists()

    await this.executeScript(`
      const element = document.querySelector('${selector}');
      if (!element) throw new Error('Element not found: ${selector}');
      element.click();
    `)
  }

  /**
   * 向输入框输入文本
   */
  async type(selector: string, text: string): Promise<void> {
    this.ensureSessionExists()

    // 先清空输入框
    await this.executeScript(`
      const element = document.querySelector('${selector}');
      if (!element) throw new Error('Element not found: ${selector}');
      element.value = '';
    `)

    // 然后输入文本
    await this.executeScript(`
      const element = document.querySelector('${selector}');
      if (!element) throw new Error('Element not found: ${selector}');
      element.value = '${text.replace(/'/g, '\\\'')}';
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    `)
  }

  /**
   * 获取元素文本内容
   */
  async getText(selector: string): Promise<string> {
    this.ensureSessionExists()

    return this.executeScript(`
      const element = document.querySelector('${selector}');
      if (!element) throw new Error('Element not found: ${selector}');
      return element.textContent.trim();
    `)
  }

  /**
   * 获取屏幕截图
   */
  async getScreenshot(): Promise<Buffer> {
    this.ensureSessionExists()

    const response = await this.api(`/v1/sessions/${this.sessionId}/screenshot`, {
      method: 'GET',
    })

    if (!response.ok) {
      throw new Error(`截图失败: ${response.statusText || '未知错误'}`)
    }

    const buffer = await response.arrayBuffer()
    return Buffer.from(buffer)
  }

  /**
   * 关闭会话
   */
  async closeSession(): Promise<void> {
    if (!this.sessionId)
      return

    const response = await this.api(`/v1/sessions/${this.sessionId}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      throw new Error(`关闭会话失败: ${response.statusText || '未知错误'}`)
    }

    this.sessionId = null
  }

  /**
   * 确保会话存在
   */
  private ensureSessionExists(): void {
    if (!this.sessionId) {
      throw new Error('No active session. Call createSession first.')
    }
  }
}
