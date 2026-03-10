/**
 * 视觉系统状态管理 (Pinia Store)
 * 管理视觉功能的状态和交互
 */

import type {
  AnalysisResult,
  VisionAuthState,
  VisionConfig,
  VisionState,
  WindowInfo,
} from '../../../apps/stage-tamagotchi/src/shared/vision'

import { ipcRenderer } from 'electron'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import {
  containsVisionCommand,
  DEFAULT_VISION_CONFIG,
  VISION_CHANNELS,
} from '../../../apps/stage-tamagotchi/src/shared/vision'

export const useVisionStore = defineStore('vision', () => {
  // ============ State ============

  // 配置
  const config = ref<VisionConfig>({ ...DEFAULT_VISION_CONFIG })

  // 状态
  const isCapturing = ref(false)
  const isAnalyzing = ref(false)
  const lastScreenshot = ref<string | undefined>(undefined)
  const lastAnalysis = ref<AnalysisResult | undefined>(undefined)
  const error = ref<string | undefined>(undefined)

  // 历史记录
  const history = ref<Array<{
    screenshot: string
    analysis: AnalysisResult
    timestamp: number
  }>>([])

  // 当前活动窗口
  const activeWindow = ref<WindowInfo | null>(null)

  // 语音触发监听状态
  const isListeningForVoice = ref(false)

  // 授权状态
  const authState = ref<VisionAuthState>({
    isAuthorized: false,
    denyCount: 0,
  })

  // ============ Getters ============

  const isEnabled = computed(() => config.value.enabled)
  const isReady = computed(() => isEnabled.value && !isCapturing.value && !isAnalyzing.value)
  const hasScreenshot = computed(() => !!lastScreenshot.value)
  const hasAnalysis = computed(() => !!lastAnalysis.value)

  // 检查是否配置了 API 密钥
  const hasApiKey = computed(() => {
    const model = config.value.model
    if (model === 'qwen2.5-vl' || model === 'ui-tars') {
      // 本地模型不需要 API 密钥
      return true
    }
    return !!config.value.apiKey
  })

  // 是否已授权
  const isAuthorized = computed(() => authState.value.isAuthorized)

  // 是否可以执行视觉分析
  const canAnalyze = computed(() => {
    return isEnabled.value && hasApiKey.value && isAuthorized.value && !isCapturing.value && !isAnalyzing.value
  })

  // ============ Actions ============

  /**
   * 初始化 Store
   * 从主进程加载配置
   */
  async function init(): Promise<void> {
    try {
      const result = await ipcRenderer.invoke(VISION_CHANNELS.GET_CONFIG)
      if (result.success) {
        config.value = result.data
      }

      const stateResult = await ipcRenderer.invoke(VISION_CHANNELS.GET_STATE)
      if (stateResult.success) {
        updateStateFromMain(stateResult.data)
      }
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      console.error('Failed to init vision store:', err)
    }
  }

  /**
   * 从主进程状态更新本地状态
   */
  function updateStateFromMain(state: VisionState): void {
    isCapturing.value = state.isCapturing
    isAnalyzing.value = state.isAnalyzing
    if (state.lastScreenshot) {
      lastScreenshot.value = state.lastScreenshot
    }
    if (state.lastAnalysis) {
      lastAnalysis.value = state.lastAnalysis
    }
    if (state.error) {
      error.value = state.error
    }
  }

  /**
   * 更新配置
   */
  async function updateConfig(newConfig: Partial<VisionConfig>): Promise<boolean> {
    try {
      error.value = undefined
      const result = await ipcRenderer.invoke(VISION_CHANNELS.SET_CONFIG, newConfig)

      if (result.success) {
        config.value = result.data
        return true
      }
      else {
        error.value = result.error
        return false
      }
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      return false
    }
  }

  /**
   * 捕获屏幕
   */
  async function captureScreen(): Promise<string | null> {
    try {
      error.value = undefined
      isCapturing.value = true

      const result = await ipcRenderer.invoke(VISION_CHANNELS.CAPTURE_SCREEN)

      isCapturing.value = false

      if (result.success) {
        lastScreenshot.value = result.data
        return result.data
      }
      else {
        error.value = result.error
        return null
      }
    }
    catch (err) {
      isCapturing.value = false
      error.value = err instanceof Error ? err.message : String(err)
      return null
    }
  }

  /**
   * 分析屏幕
   */
  async function analyzeScreen(prompt?: string): Promise<AnalysisResult | null> {
    try {
      error.value = undefined
      isAnalyzing.value = true

      // 如果没有截图，先捕获屏幕
      let screenshot = lastScreenshot.value
      if (!screenshot) {
        screenshot = await captureScreen()
        if (!screenshot) {
          isAnalyzing.value = false
          return null
        }
      }

      const result = await ipcRenderer.invoke(VISION_CHANNELS.ANALYZE_SCREEN, screenshot, prompt)

      isAnalyzing.value = false

      if (result.success) {
        lastAnalysis.value = result.data

        // 添加到历史记录
        if (config.value.saveHistory) {
          addToHistory(screenshot, result.data)
        }

        return result.data
      }
      else {
        error.value = result.error
        return null
      }
    }
    catch (err) {
      isAnalyzing.value = false
      error.value = err instanceof Error ? err.message : String(err)
      return null
    }
  }

  /**
   * 捕获并分析（快捷方法）
   */
  async function captureAndAnalyze(prompt?: string): Promise<{
    screenshot: string
    analysis: AnalysisResult
  } | null> {
    try {
      error.value = undefined
      isCapturing.value = true
      isAnalyzing.value = true

      // 捕获屏幕
      const captureResult = await ipcRenderer.invoke(VISION_CHANNELS.CAPTURE_SCREEN)

      if (!captureResult.success) {
        isCapturing.value = false
        isAnalyzing.value = false
        error.value = captureResult.error
        return null
      }

      const screenshot = captureResult.data
      lastScreenshot.value = screenshot
      isCapturing.value = false

      // 分析屏幕
      const analysisResult = await ipcRenderer.invoke(VISION_CHANNELS.ANALYZE_SCREEN, screenshot, prompt)

      isAnalyzing.value = false

      if (analysisResult.success) {
        lastAnalysis.value = analysisResult.data

        // 添加到历史记录
        if (config.value.saveHistory) {
          addToHistory(screenshot, analysisResult.data)
        }

        return {
          screenshot,
          analysis: analysisResult.data,
        }
      }
      else {
        error.value = analysisResult.error
        return null
      }
    }
    catch (err) {
      isCapturing.value = false
      isAnalyzing.value = false
      error.value = err instanceof Error ? err.message : String(err)
      return null
    }
  }

  /**
   * 获取活动窗口
   */
  async function refreshActiveWindow(): Promise<WindowInfo | null> {
    try {
      const result = await ipcRenderer.invoke(VISION_CHANNELS.GET_ACTIVE_WINDOW)

      if (result.success) {
        activeWindow.value = result.data
        return result.data
      }
      else {
        return null
      }
    }
    catch (err) {
      console.error('Failed to get active window:', err)
      return null
    }
  }

  /**
   * 添加到历史记录
   */
  function addToHistory(screenshot: string, analysis: AnalysisResult): void {
    history.value.unshift({
      screenshot,
      analysis,
      timestamp: Date.now(),
    })

    // 限制历史记录数量
    if (history.value.length > config.value.maxHistoryItems) {
      history.value = history.value.slice(0, config.value.maxHistoryItems)
    }
  }

  /**
   * 清除历史记录
   */
  function clearHistory(): void {
    history.value = []
  }

  /**
   * 清除错误
   */
  function clearError(): void {
    error.value = undefined
  }

  /**
   * 清除最后截图和分析
   */
  function clearLastResult(): void {
    lastScreenshot.value = undefined
    lastAnalysis.value = undefined
  }

  /**
   * 启用视觉功能
   */
  async function enable(): Promise<boolean> {
    return await updateConfig({ enabled: true })
  }

  /**
   * 禁用视觉功能
   */
  async function disable(): Promise<boolean> {
    return await updateConfig({ enabled: false })
  }

  /**
   * 切换启用状态
   */
  async function toggle(): Promise<boolean> {
    return await updateConfig({ enabled: !config.value.enabled })
  }

  /**
   * 设置触发模式
   */
  async function setTriggerMode(mode: VisionConfig['triggerMode']): Promise<boolean> {
    return await updateConfig({ triggerMode: mode })
  }

  /**
   * 设置视觉模型
   */
  async function setModel(model: VisionConfig['model']): Promise<boolean> {
    return await updateConfig({ model })
  }

  /**
   * 设置 API 密钥
   */
  async function setApiKey(apiKey: string): Promise<boolean> {
    return await updateConfig({ apiKey })
  }

  /**
   * 开始语音触发监听
   */
  function startVoiceListening(): void {
    isListeningForVoice.value = true
  }

  /**
   * 停止语音触发监听
   */
  function stopVoiceListening(): void {
    isListeningForVoice.value = false
  }

  /**
   * 处理语音指令
   * 检查是否包含视觉指令，如果是则触发视觉分析
   */
  async function handleVoiceCommand(command: string): Promise<boolean> {
    if (!isListeningForVoice.value) {
      return false
    }

    if (containsVisionCommand(command)) {
      await captureAndAnalyze()
      return true
    }

    return false
  }

  /**
   * 检查消息是否应触发视觉分析
   */
  function shouldTriggerFromMessage(message: string): boolean {
    return containsVisionCommand(message)
  }

  // ============ 授权相关 Actions ============

  /**
   * 检查授权状态
   */
  async function checkAuth(): Promise<VisionAuthState> {
    try {
      const result = await ipcRenderer.invoke(VISION_CHANNELS.GET_AUTH_STATE)
      if (result.success) {
        authState.value = result.data
        return result.data
      }
      return authState.value
    }
    catch (err) {
      console.error('Failed to check auth state:', err)
      return authState.value
    }
  }

  /**
   * 请求授权
   * 返回是否已授权
   */
  async function requestAuth(): Promise<boolean> {
    try {
      const result = await ipcRenderer.invoke(VISION_CHANNELS.REQUEST_AUTH)
      if (result.success) {
        authState.value = result.data
        return result.data.isAuthorized
      }
      return false
    }
    catch (err) {
      console.error('Failed to request auth:', err)
      return false
    }
  }

  /**
   * 授予授权
   */
  async function grantAuth(): Promise<void> {
    try {
      await ipcRenderer.invoke(VISION_CHANNELS.GRANT_AUTH)
      await checkAuth()
    }
    catch (err) {
      console.error('Failed to grant auth:', err)
    }
  }

  /**
   * 撤销授权
   */
  async function revokeAuth(): Promise<void> {
    try {
      await ipcRenderer.invoke(VISION_CHANNELS.REVOKE_AUTH)
      authState.value = {
        isAuthorized: false,
        denyCount: 0,
      }
    }
    catch (err) {
      console.error('Failed to revoke auth:', err)
    }
  }

  /**
   * 监听授权状态变化
   */
  function listenForAuthChanges(): () => void {
    const handler = (_event: any, newState: VisionAuthState) => {
      authState.value = newState
    }

    ipcRenderer.on(VISION_CHANNELS.ON_AUTH_CHANGED, handler)

    // 返回取消监听的函数
    return () => {
      ipcRenderer.removeListener(VISION_CHANNELS.ON_AUTH_CHANGED, handler)
    }
  }

  // ============ Return ============

  return {
    // State
    config,
    isCapturing,
    isAnalyzing,
    lastScreenshot,
    lastAnalysis,
    error,
    history,
    activeWindow,
    isListeningForVoice,
    authState,

    // Getters
    isEnabled,
    isReady,
    hasScreenshot,
    hasAnalysis,
    hasApiKey,
    isAuthorized,
    canAnalyze,

    // Actions
    init,
    updateConfig,
    captureScreen,
    analyzeScreen,
    captureAndAnalyze,
    refreshActiveWindow,
    clearHistory,
    clearError,
    clearLastResult,
    enable,
    disable,
    toggle,
    setTriggerMode,
    setModel,
    setApiKey,
    startVoiceListening,
    stopVoiceListening,
    handleVoiceCommand,
    shouldTriggerFromMessage,
    checkAuth,
    requestAuth,
    grantAuth,
    revokeAuth,
    listenForAuthChanges,
  }
})

// 导出类型
export type VisionStore = ReturnType<typeof useVisionStore>
