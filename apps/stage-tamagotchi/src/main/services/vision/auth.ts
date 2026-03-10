/**
 * 视觉系统授权服务
 * 管理用户授权状态
 */

import type { VisionAuthState } from '../../../shared/vision'

import { consola } from 'consola'

const logger = consola.create({ level: 4 })

// 授权状态
let authState: VisionAuthState = {
  isAuthorized: false,
  denyCount: 0,
}

// 授权回调函数
let onAuthChangedCallback: ((state: VisionAuthState) => void) | null = null

/**
 * 初始化授权服务
 */
export function initAuthService(): void {
  logger.info('Initializing vision auth service...')
  // 从持久化存储加载授权状态（如果需要）
  // 这里简化处理，每次启动都需要重新授权
  authState = {
    isAuthorized: false,
    denyCount: 0,
  }
}

/**
 * 获取授权状态
 */
export function getAuthState(): VisionAuthState {
  return { ...authState }
}

/**
 * 检查是否已授权
 */
export function isAuthorized(): boolean {
  return authState.isAuthorized
}

/**
 * 请求授权
 * @returns 是否已授权
 */
export function requestAuth(): boolean {
  logger.info('Requesting vision authorization...')

  // 如果已经授权，直接返回
  if (authState.isAuthorized) {
    return true
  }

  // 更新最后提示时间
  authState.lastPromptTime = Date.now()

  // 通知渲染进程显示授权对话框
  notifyAuthChanged()

  return false
}

/**
 * 授予授权
 */
export function grantAuth(): void {
  logger.info('Vision authorization granted')

  authState = {
    isAuthorized: true,
    authTime: Date.now(),
    denyCount: 0,
  }

  notifyAuthChanged()
}

/**
 * 拒绝授权
 */
export function denyAuth(): void {
  logger.info('Vision authorization denied')

  authState.denyCount++
  authState.lastPromptTime = Date.now()

  notifyAuthChanged()
}

/**
 * 撤销授权
 */
export function revokeAuth(): void {
  logger.info('Vision authorization revoked')

  authState = {
    isAuthorized: false,
    denyCount: 0,
  }

  notifyAuthChanged()
}

/**
 * 检查是否需要重新提示授权
 * @param cooldownMinutes 冷却时间（分钟）
 */
export function shouldPromptAuth(cooldownMinutes: number = 60): boolean {
  if (authState.isAuthorized) {
    return false
  }

  // 如果拒绝次数过多，增加冷却时间
  const adjustedCooldown = cooldownMinutes * 2 ** Math.min(authState.denyCount, 5)

  if (!authState.lastPromptTime) {
    return true
  }

  const cooldownMs = adjustedCooldown * 60 * 1000
  return Date.now() - authState.lastPromptTime > cooldownMs
}

/**
 * 设置授权变更回调
 */
export function onAuthChanged(callback: (state: VisionAuthState) => void): void {
  onAuthChangedCallback = callback
}

/**
 * 通知授权状态变更
 */
function notifyAuthChanged(): void {
  if (onAuthChangedCallback) {
    onAuthChangedCallback({ ...authState })
  }
}

/**
 * 检查操作是否需要授权
 * @param operation 操作类型
 */
export function requiresAuth(_operation: 'capture' | 'analyze' | 'action'): boolean {
  // 所有视觉相关操作都需要授权
  return true
}

/**
 * 获取授权提示信息
 */
export function getAuthPromptMessage(): {
  title: string
  message: string
  detail: string
} {
  return {
    title: '启用视觉功能',
    message: 'AI 视觉功能需要捕获您的屏幕内容',
    detail: `启用后，AI 将能够：
• 捕获屏幕截图进行分析
• 识别屏幕上的文字和界面元素
• 根据您的指令执行界面操作

您的屏幕数据仅用于实时分析，不会被存储或传输到第三方（除非您配置了云端模型）。

您可以在设置中随时关闭此功能。`,
  }
}
