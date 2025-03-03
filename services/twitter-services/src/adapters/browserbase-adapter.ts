import type { Buffer } from 'node:buffer'
import type { BrowserBaseClientOptions } from '../browser/browserbase'
import type { BrowserConfig, ElementHandle, WaitOptions } from '../types/browser'
import type { BrowserAdapter } from './browser-adapter'

import { BrowserBaseClient } from '../browser/browserbase'
import { errorToMessage } from '../utils/error'
import { logger } from '../utils/logger'

/**
 * BrowserBase 元素句柄实现
 */
class BrowserBaseElementHandle implements ElementHandle {
  private client: BrowserBaseClient
  private selector: string

  constructor(client: BrowserBaseClient, selector: string) {
    this.client = client
    this.selector = selector
  }

  async getText(): Promise<string> {
    return this.client.executeScript<string>(`
      document.querySelector('${this.selector}').textContent.trim()
    `)
  }

  async getAttribute(name: string): Promise<string | null> {
    return this.client.executeScript<string | null>(`
      document.querySelector('${this.selector}').getAttribute('${name}')
    `)
  }

  async click(): Promise<void> {
    await this.client.click(this.selector)
  }

  async type(text: string): Promise<void> {
    await this.client.type(this.selector, text)
  }
}

/**
 * BrowserBase 适配器实现
 * 将 BrowserBase API 适配为通用浏览器接口
 */
export class BrowserBaseMCPAdapter implements BrowserAdapter {
  private client: BrowserBaseClient

  constructor(apiKey: string, baseUrl?: string, options: Partial<BrowserBaseClientOptions> = {}) {
    this.client = new BrowserBaseClient({
      apiKey,
      baseUrl,
      ...options,
    })
  }

  async initialize(config: BrowserConfig): Promise<void> {
    try {
      await this.client.createSession({
        headless: config.headless,
        userAgent: config.userAgent,
        viewport: config.viewport,
        // proxyUrl: config.proxy, // TODO: Proxy
      })
      logger.browser.log('浏览器会话已创建', { headless: config.headless })
    }
    catch (error) {
      logger.browser.errorWithError('浏览器初始化失败', error)
      throw new Error(`无法初始化浏览器: ${errorToMessage(error)}`)
    }
  }

  async navigate(url: string): Promise<void> {
    await this.client.navigate(url)
  }

  async executeScript<T>(script: string): Promise<T> {
    return this.client.executeScript<T>(script)
  }

  async waitForSelector(selector: string, options?: WaitOptions): Promise<void> {
    await this.client.waitForSelector(selector, {
      timeout: options?.timeout,
    })
  }

  async click(selector: string): Promise<void> {
    await this.client.click(selector)
  }

  async type(selector: string, text: string): Promise<void> {
    await this.client.type(selector, text)
  }

  async getText(selector: string): Promise<string> {
    return this.client.getText(selector)
  }

  async getElements(selector: string): Promise<ElementHandle[]> {
    // 获取所有匹配元素的选择器
    const selectors = await this.executeScript<string[]>(`
      Array.from(document.querySelectorAll('${selector}')).map((el, i) => {
        const uniqueId = 'browserbase-' + Date.now() + '-' + i;
        el.setAttribute('data-browserbase-id', uniqueId);
        return '[data-browserbase-id="' + uniqueId + '"]';
      })
    `)

    // 为每个匹配的元素创建一个 ElementHandle
    return selectors.map(selector => new BrowserBaseElementHandle(this.client, selector))
  }

  async getScreenshot(): Promise<Buffer> {
    return this.client.getScreenshot()
  }

  async close(): Promise<void> {
    await this.client.closeSession()
  }
}
