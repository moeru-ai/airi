/**
 * 浏览器配置接口
 */
export interface BrowserConfig {
  headless?: boolean
  userAgent?: string
  viewport?: {
    width: number
    height: number
  }
  timeout?: number
  requestTimeout?: number // API 请求超时设置
  requestRetries?: number // 请求重试次数
  proxy?: string
}

/**
 * 元素句柄接口
 */
export interface ElementHandle {
  getText: () => Promise<string>
  getAttribute: (name: string) => Promise<string | null>
  click: () => Promise<void>
  type: (text: string) => Promise<void>
}

/**
 * 等待选项接口
 */
export interface WaitOptions {
  timeout?: number
  visible?: boolean
  hidden?: boolean
}
