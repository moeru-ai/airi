import type { Buffer } from 'node:buffer'
import type { BrowserConfig, ElementHandle, WaitOptions } from '../types/browser'

/**
 * 浏览器操作的通用接口
 * 定义了与不同浏览器后端交互所需的基本操作
 */
export interface BrowserAdapter {
  /**
   * 初始化浏览器会话
   */
  initialize: (config: BrowserConfig) => Promise<void>

  /**
   * 导航到指定 URL
   */
  navigate: (url: string) => Promise<void>

  /**
   * 执行 JavaScript 脚本
   */
  executeScript: <T>(script: string) => Promise<T>

  /**
   * 等待元素出现
   */
  waitForSelector: (selector: string, options?: WaitOptions) => Promise<void>

  /**
   * 点击元素
   */
  click: (selector: string) => Promise<void>

  /**
   * 向输入框输入文本
   */
  type: (selector: string, text: string) => Promise<void>

  /**
   * 获取元素文本内容
   */
  getText: (selector: string) => Promise<string>

  /**
   * 获取多个元素的句柄
   */
  getElements: (selector: string) => Promise<ElementHandle[]>

  /**
   * 获取屏幕截图
   */
  getScreenshot: () => Promise<Buffer>

  /**
   * 关闭浏览器会话
   */
  close: () => Promise<void>
}
