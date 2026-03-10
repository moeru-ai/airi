/**
 * 视觉服务入口
 * 整合屏幕捕获和 Midscene 代理，提供统一的视觉服务接口
 */

import type {
  Action,
  AnalysisResult,
  VisionConfig,
  VisionState,
} from '../../../shared/vision'

import { consola } from 'consola'
import { ipcMain } from 'electron'

import {
  DEFAULT_VISION_CONFIG,
  VISION_CHANNELS,
} from '../../../shared/vision'
import {
  getAuthState,
  grantAuth,
  initAuthService,
  onAuthChanged,
  requestAuth,
  revokeAuth,
} from './auth'
import {
  analyzeScreen,
  destroyAgent,
  executeAction,
  getAgentStatus,
  initAgent,
} from './midscene-agent'
import {
  initPerformanceService,
} from './performance'
import {
  getPrivacyConfig,
  initPrivacyService,
  protectPrivacy,
} from './privacy'
import {
  bufferToBase64,
  captureScreen,
  captureWindow,
  getActiveWindow,
  listWindows,
} from './screen-capture'
import {
  getVisionConfig,
  initSecureStorage,
  storeVisionConfig,
} from './secure-storage'

const logger = consola.create({ level: 4 })

// 当前配置
let currentConfig: VisionConfig = { ...DEFAULT_VISION_CONFIG }

// 当前状态
const currentState: VisionState = {
  isCapturing: false,
  isAnalyzing: false,
}

// 轮询定时器
let autoCaptureInterval: NodeJS.Timeout | null = null

/**
 * 初始化视觉服务
 * @param config 初始配置
 */
export async function initVisionService(config?: Partial<VisionConfig>): Promise<void> {
  logger.info('Initializing vision service...')

  // 合并配置
  currentConfig = {
    ...DEFAULT_VISION_CONFIG,
    ...config,
  }

  // 初始化授权服务
  initAuthService()

  // 初始化隐私保护服务
  initPrivacyService(config?.privacy)

  // 初始化安全存储服务
  initSecureStorage()

  // 初始化性能服务
  initPerformanceService(config?.performance)

  // 从安全存储加载 API 密钥
  const storedConfig = getVisionConfig()
  if (storedConfig?.apiKey && !currentConfig.apiKey) {
    currentConfig.apiKey = storedConfig.apiKey
  }

  // 如果启用了视觉功能，初始化 Agent
  if (currentConfig.enabled && currentConfig.apiKey) {
    try {
      await initAgent(currentConfig)
    }
    catch (error) {
      logger.error('Failed to initialize vision agent:', error)
      // 不阻止服务启动，但记录错误
    }
  }

  // 注册 IPC 处理器
  registerIpcHandlers()

  // 监听授权状态变化，通知渲染进程
  onAuthChanged((state) => {
    // 这里可以通过 WebSocket 或 IPC 通知所有渲染进程
    logger.info('Auth state changed:', state)
  })

  // 如果配置了自动轮询，启动轮询
  if (currentConfig.enabled && currentConfig.triggerMode === 'auto') {
    startAutoCapture()
  }

  logger.info('Vision service initialized')
}

/**
 * 销毁视觉服务
 */
export function destroyVisionService(): void {
  logger.info('Destroying vision service...')

  // 停止自动轮询
  stopAutoCapture()

  // 销毁 Agent
  destroyAgent()

  // 移除 IPC 处理器
  unregisterIpcHandlers()

  logger.info('Vision service destroyed')
}

/**
 * 注册 IPC 处理器
 */
function registerIpcHandlers(): void {
  // 屏幕捕获
  ipcMain.handle(VISION_CHANNELS.CAPTURE_SCREEN, async () => {
    try {
      currentState.isCapturing = true
      const buffer = await captureScreen()
      currentState.isCapturing = false
      return { success: true, data: bufferToBase64(buffer) }
    }
    catch (error) {
      currentState.isCapturing = false
      currentState.error = error instanceof Error ? error.message : String(error)
      return { success: false, error: currentState.error }
    }
  })

  ipcMain.handle(VISION_CHANNELS.CAPTURE_WINDOW, async (_, windowId: number) => {
    try {
      currentState.isCapturing = true
      const buffer = await captureWindow(windowId)
      currentState.isCapturing = false
      return { success: true, data: bufferToBase64(buffer) }
    }
    catch (error) {
      currentState.isCapturing = false
      currentState.error = error instanceof Error ? error.message : String(error)
      return { success: false, error: currentState.error }
    }
  })

  ipcMain.handle(VISION_CHANNELS.GET_ACTIVE_WINDOW, async () => {
    try {
      const window = await getActiveWindow()
      return { success: true, data: window }
    }
    catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle(VISION_CHANNELS.LIST_WINDOWS, async () => {
    try {
      const windows = await listWindows()
      return { success: true, data: windows }
    }
    catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  // 分析
  ipcMain.handle(VISION_CHANNELS.ANALYZE_SCREEN, async (_, imageBase64: string, prompt?: string) => {
    try {
      currentState.isAnalyzing = true
      const buffer = Buffer.from(imageBase64, 'base64')
      const result = await analyzeScreen(buffer, prompt, currentConfig)
      currentState.isAnalyzing = false

      // 对分析结果进行隐私保护处理
      const privacyConfig = getPrivacyConfig()
      if (privacyConfig.enabled && result.text) {
        const { sanitized } = protectPrivacy(result.text, privacyConfig)
        result.text = sanitized
      }

      currentState.lastAnalysis = result
      return { success: true, data: result }
    }
    catch (error) {
      currentState.isAnalyzing = false
      currentState.error = error instanceof Error ? error.message : String(error)
      return { success: false, error: currentState.error }
    }
  })

  ipcMain.handle(VISION_CHANNELS.EXECUTE_ACTION, async (_, action: Action) => {
    try {
      await executeAction(action, currentConfig)
      return { success: true }
    }
    catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  // 配置
  ipcMain.handle(VISION_CHANNELS.GET_CONFIG, () => {
    return { success: true, data: currentConfig }
  })

  ipcMain.handle(VISION_CHANNELS.SET_CONFIG, async (_, config: Partial<VisionConfig>) => {
    try {
      await updateConfig(config)
      return { success: true, data: currentConfig }
    }
    catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  // 状态
  ipcMain.handle(VISION_CHANNELS.GET_STATE, () => {
    return { success: true, data: currentState }
  })

  // 授权
  ipcMain.handle(VISION_CHANNELS.GET_AUTH_STATE, () => {
    return { success: true, data: getAuthState() }
  })

  ipcMain.handle(VISION_CHANNELS.REQUEST_AUTH, () => {
    const authorized = requestAuth()
    return { success: true, data: authorized }
  })

  ipcMain.handle(VISION_CHANNELS.GRANT_AUTH, () => {
    grantAuth()
    return { success: true }
  })

  ipcMain.handle(VISION_CHANNELS.REVOKE_AUTH, () => {
    revokeAuth()
    return { success: true }
  })
}

/**
 * 移除 IPC 处理器
 */
function unregisterIpcHandlers(): void {
  Object.values(VISION_CHANNELS).forEach((channel) => {
    ipcMain.removeHandler(channel)
  })
}

/**
 * 更新配置
 * @param config 配置更新
 */
async function updateConfig(config: Partial<VisionConfig>): Promise<void> {
  const oldConfig = { ...currentConfig }
  currentConfig = { ...currentConfig, ...config }

  logger.info('Vision config updated')

  // 如果 API 密钥变更，保存到安全存储
  if (config.apiKey !== undefined) {
    if (config.apiKey) {
      storeVisionConfig({ apiKey: config.apiKey })
    }
    else {
      // 如果 API 密钥被清空，从安全存储中移除
      const stored = getVisionConfig()
      if (stored) {
        stored.apiKey = ''
        storeVisionConfig(stored)
      }
    }
  }

  // 如果模型或 API 密钥变更，重新初始化 Agent
  if (
    config.model !== undefined
    || config.apiKey !== undefined
    || config.apiEndpoint !== undefined
    || config.localModelEndpoint !== undefined
  ) {
    if (currentConfig.enabled) {
      try {
        await initAgent(currentConfig)
      }
      catch (error) {
        logger.error('Failed to reinitialize agent after config update:', error)
        // 恢复旧配置
        currentConfig = oldConfig
        throw error
      }
    }
  }

  // 如果触发模式变更，处理自动轮询
  if (config.triggerMode !== undefined || config.enabled !== undefined) {
    if (currentConfig.enabled && currentConfig.triggerMode === 'auto') {
      startAutoCapture()
    }
    else {
      stopAutoCapture()
    }
  }

  // 如果轮询间隔变更，重启轮询
  if (config.autoInterval !== undefined && autoCaptureInterval) {
    startAutoCapture()
  }
}

/**
 * 启动自动截图
 */
function startAutoCapture(): void {
  // 先停止现有的轮询
  stopAutoCapture()

  if (!currentConfig.enabled || currentConfig.triggerMode !== 'auto') {
    return
  }

  logger.info(`Starting auto capture with interval: ${currentConfig.autoInterval}ms`)

  autoCaptureInterval = setInterval(async () => {
    try {
      if (currentState.isCapturing || currentState.isAnalyzing) {
        logger.debug('Skipping auto capture, already processing')
        return
      }

      // 捕获屏幕
      currentState.isCapturing = true
      const buffer = await captureScreen()
      currentState.isCapturing = false

      // 更新最后截图
      currentState.lastScreenshot = bufferToBase64(buffer)

      // 可以在这里添加变化检测逻辑
      // 如果屏幕变化显著，触发分析

      logger.debug('Auto capture completed')
    }
    catch (error) {
      logger.error('Auto capture failed:', error)
      currentState.isCapturing = false
    }
  }, currentConfig.autoInterval)
}

/**
 * 停止自动截图
 */
function stopAutoCapture(): void {
  if (autoCaptureInterval) {
    clearInterval(autoCaptureInterval)
    autoCaptureInterval = null
    logger.info('Auto capture stopped')
  }
}

/**
 * 捕获并分析屏幕
 * @param prompt 分析提示（可选）
 * @returns 分析结果
 */
export async function captureAndAnalyze(prompt?: string): Promise<{
  success: boolean
  data?: AnalysisResult
  screenshot?: string
  error?: string
}> {
  try {
    // 捕获屏幕
    currentState.isCapturing = true
    const buffer = await captureScreen()
    currentState.isCapturing = false

    // 转换为 base64
    const base64 = bufferToBase64(buffer)
    currentState.lastScreenshot = base64

    // 分析屏幕
    currentState.isAnalyzing = true
    const result = await analyzeScreen(buffer, prompt, currentConfig)
    currentState.isAnalyzing = false
    currentState.lastAnalysis = result

    return {
      success: true,
      data: result,
      screenshot: base64,
    }
  }
  catch (error) {
    currentState.isCapturing = false
    currentState.isAnalyzing = false
    currentState.error = error instanceof Error ? error.message : String(error)

    return {
      success: false,
      error: currentState.error,
    }
  }
}

/**
 * 获取当前配置
 */
export function getConfig(): VisionConfig {
  return { ...currentConfig }
}

/**
 * 获取当前状态
 */
export function getState(): VisionState {
  return { ...currentState }
}

/**
 * 获取 Agent 状态
 */
export function getAgentState(): ReturnType<typeof getAgentStatus> {
  return getAgentStatus()
}

export {
  DEFAULT_VISION_CONFIG,
  VISION_CHANNELS,
} from '../../../shared/vision'
export type {
  Action,
  AnalysisResult,
  PrivacyConfig,
  VisionAuthState,
  VisionConfig,
  VisionState,
  WindowInfo,
} from '../../../shared/vision'
export * from './auth'
export * from './input-control'
export * from './midscene-agent'
export * from './performance'
export * from './privacy'
// 导出子模块
export * from './screen-capture'
export * from './secure-storage'
