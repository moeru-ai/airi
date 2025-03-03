import type { Buffer } from 'node:buffer'
import type { Browser, Page } from 'playwright'
import type { z } from 'zod'

import { chromium } from 'playwright'

import { logger } from '../utils/logger'

/**
 * Stagehand 客户端配置选项
 */
export interface StagehandClientOptions {
  apiKey: string
  baseUrl?: string
  timeout?: number
  headless?: boolean
  userAgent?: string
  viewport?: { width: number, height: number }
}

/**
 * Stagehand 客户端
 * 使用 @browserbasehq/stagehand 实现浏览器自动化
 */
export class StagehandClient {
  private browser: Browser | null = null
  private page: Page | null = null
  private apiKey: string
  private options: Omit<StagehandClientOptions, 'apiKey'>

  constructor(options: StagehandClientOptions) {
    const {
      apiKey,
      baseUrl,
      timeout = 30000,
      headless = true,
      userAgent,
      viewport = { width: 1280, height: 800 },
    } = options

    this.apiKey = apiKey
    this.options = {
      baseUrl,
      timeout,
      headless,
      userAgent,
      viewport,
    }
  }

  /**
   * 创建浏览器会话
   */
  async createSession(options?: {
    headless?: boolean
    userAgent?: string
    viewport?: { width: number, height: number }
  }): Promise<string> {
    try {
      // 启动 Playwright 浏览器
      this.browser = await chromium.launch({
        headless: options?.headless ?? this.options.headless,
      })

      // 创建上下文
      const context = await this.browser.newContext({
        userAgent: options?.userAgent ?? this.options.userAgent,
        viewport: options?.viewport ?? this.options.viewport,
        // 设置任何其他所需的浏览器上下文选项
      })

      // 创建页面
      this.page = await context.newPage()

      // 为页面添加 Stagehand 扩展
      await this.setupStagehand()

      const sessionId = `session-${Date.now()}`
      logger.browser.withField('sessionId', sessionId).log('创建浏览器会话成功')
      return sessionId
    }
    catch (error) {
      logger.browser.errorWithError('创建浏览器会话失败', error)
      throw error
    }
  }

  /**
   * 设置 Stagehand 扩展
   * 这将添加 act, extract, observe 方法到 page 对象
   */
  private async setupStagehand(): Promise<void> {
    if (!this.page) {
      throw new Error('No active page. Call createSession first.')
    }

    // 在实际实现中，这里会使用 Stagehand 的 API 设置页面对象
    // 这可能涉及到页面扩展或注入 Stagehand 的功能
    // 示例代码（实际使用需要根据 Stagehand 的文档进行调整）:
    //
    // import { extendPage } from '@browserbasehq/stagehand'
    // await extendPage(this.page, {
    //   apiKey: this.apiKey,
    //   // 其他 Stagehand 选项
    // })
  }

  /**
   * 导航到指定URL
   */
  async navigate(url: string): Promise<void> {
    this.ensurePageExists()
    await this.page!.goto(url, { timeout: this.options.timeout })
  }

  /**
   * 执行JavaScript脚本
   */
  async executeScript<T>(script: string): Promise<T> {
    this.ensurePageExists()
    return await this.page!.evaluate(script) as T
  }

  /**
   * 使用 Stagehand 的 act API 执行操作
   */
  async act(instruction: string): Promise<void> {
    this.ensurePageExists()

    // 在实际实现中，这将使用 Stagehand 的 act API
    // 示例：await this.page!.act(instruction)

    // 临时实现，使用 Playwright 的基本能力模拟
    logger.browser.withField('instruction', instruction).log('执行 act 指令')

    // 这里通过简单的方法来模拟 act 的行为
    // 实际需要使用 Stagehand 的 act API
    if (instruction.includes('click')) {
      const match = instruction.match(/click on the ['"](.+?)['"]/)
      if (match && match[1]) {
        await this.page!.getByText(match[1]).first().click()
      }
    }
  }

  /**
   * 使用 Stagehand 的 extract API 提取数据
   */
  async extract<T extends z.ZodTypeAny>({
    instruction,
    _schema,
  }: {
    instruction: string
    _schema: T
  }): Promise<z.infer<T>> {
    this.ensurePageExists()

    // 在实际实现中，这将使用 Stagehand 的 extract API
    // 示例：return await this.page!.extract({ instruction, schema })

    // 临时实现，记录指令并返回一个空对象
    logger.browser.withField('instruction', instruction).log('执行 extract 指令')

    // 这里只是简单地返回一个空对象
    // 实际需要使用 Stagehand 的 extract API
    return {} as z.infer<T>
  }

  /**
   * 使用 Stagehand 的 observe API 观察页面状态
   */
  async observe(instruction: string): Promise<string> {
    this.ensurePageExists()

    // 在实际实现中，这将使用 Stagehand 的 observe API
    // 示例：return await this.page!.observe(instruction)

    // 临时实现，记录指令并返回空字符串
    logger.browser.withField('instruction', instruction).log('执行 observe 指令')

    // 这里只是简单地返回一个空字符串
    // 实际需要使用 Stagehand 的 observe API
    return ''
  }

  /**
   * 获取页面内容
   */
  async getContent(): Promise<string> {
    this.ensurePageExists()
    return await this.page!.content()
  }

  /**
   * 等待元素出现
   */
  async waitForSelector(selector: string, options: { timeout?: number } = {}): Promise<void> {
    this.ensurePageExists()
    await this.page!.waitForSelector(selector, {
      timeout: options.timeout || this.options.timeout,
    })
  }

  /**
   * 点击元素
   */
  async click(selector: string): Promise<void> {
    this.ensurePageExists()
    await this.page!.click(selector)
  }

  /**
   * 向输入框输入文本
   */
  async type(selector: string, text: string): Promise<void> {
    this.ensurePageExists()
    // 先清空输入框
    await this.page!.fill(selector, '')
    // 然后输入文本
    await this.page!.fill(selector, text)
  }

  /**
   * 获取元素文本内容
   */
  async getText(selector: string): Promise<string> {
    this.ensurePageExists()
    const element = await this.page!.$(selector)
    if (!element) {
      throw new Error(`Element not found: ${selector}`)
    }
    return (await element.textContent() || '').trim()
  }

  /**
   * 获取屏幕截图
   */
  async getScreenshot(): Promise<Buffer> {
    this.ensurePageExists()
    return await this.page!.screenshot() as Buffer
  }

  /**
   * 关闭会话
   */
  async closeSession(): Promise<void> {
    if (this.browser) {
      await this.browser.close()
      this.browser = null
      this.page = null
      logger.browser.log('浏览器会话已关闭')
    }
  }

  /**
   * 确保页面存在
   */
  private ensurePageExists(): void {
    if (!this.page) {
      throw new Error('No active page. Call createSession first.')
    }
  }
}
