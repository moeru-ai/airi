/**
 * useVision 组合式函数
 * 提供简化的视觉功能访问接口
 */

import type { AnalysisResult, VisionConfig } from '../../../apps/stage-tamagotchi/src/shared/vision'

import { computed, onMounted } from 'vue'

import { useVisionStore } from '../stores/vision'

/**
 * 视觉功能组合式函数
 * @returns 视觉功能相关的方法和状态
 */
export function useVision() {
  const store = useVisionStore()

  // ============ 响应式状态 ============

  const config = computed(() => store.config)
  const isEnabled = computed(() => store.isEnabled)
  const isReady = computed(() => store.isReady)
  const isCapturing = computed(() => store.isCapturing)
  const isAnalyzing = computed(() => store.isAnalyzing)
  const isProcessing = computed(() => store.isCapturing || store.isAnalyzing)
  const lastScreenshot = computed(() => store.lastScreenshot)
  const lastAnalysis = computed(() => store.lastAnalysis)
  const error = computed(() => store.error)
  const canAnalyze = computed(() => store.canAnalyze)
  const hasApiKey = computed(() => store.hasApiKey)
  const history = computed(() => store.history)
  const activeWindow = computed(() => store.activeWindow)

  // ============ 方法 ============

  /**
   * 初始化视觉功能
   */
  async function init(): Promise<void> {
    await store.init()
  }

  /**
   * 捕获屏幕截图
   * @returns base64 格式的截图
   */
  async function capture(): Promise<string | null> {
    return await store.captureScreen()
  }

  /**
   * 分析屏幕内容
   * @param prompt 分析提示（可选）
   * @returns 分析结果
   */
  async function analyze(prompt?: string): Promise<AnalysisResult | null> {
    return await store.analyzeScreen(prompt)
  }

  /**
   * 捕获并分析屏幕（快捷方法）
   * @param prompt 分析提示（可选）
   * @returns 截图和分析结果
   */
  async function captureAndAnalyze(prompt?: string): Promise<{
    screenshot: string
    analysis: AnalysisResult
  } | null> {
    return await store.captureAndAnalyze(prompt)
  }

  /**
   * 启用视觉功能
   */
  async function enable(): Promise<boolean> {
    return await store.enable()
  }

  /**
   * 禁用视觉功能
   */
  async function disable(): Promise<boolean> {
    return await store.disable()
  }

  /**
   * 切换视觉功能启用状态
   */
  async function toggle(): Promise<boolean> {
    return await store.toggle()
  }

  /**
   * 更新配置
   * @param newConfig 配置更新
   */
  async function updateConfig(newConfig: Partial<VisionConfig>): Promise<boolean> {
    return await store.updateConfig(newConfig)
  }

  /**
   * 设置视觉模型
   * @param model 模型类型
   */
  async function setModel(model: VisionConfig['model']): Promise<boolean> {
    return await store.setModel(model)
  }

  /**
   * 设置 API 密钥
   * @param apiKey API 密钥
   */
  async function setApiKey(apiKey: string): Promise<boolean> {
    return await store.setApiKey(apiKey)
  }

  /**
   * 设置触发模式
   * @param mode 触发模式
   */
  async function setTriggerMode(mode: VisionConfig['triggerMode']): Promise<boolean> {
    return await store.setTriggerMode(mode)
  }

  /**
   * 清除错误
   */
  function clearError(): void {
    store.clearError()
  }

  /**
   * 清除最后结果
   */
  function clearResult(): void {
    store.clearLastResult()
  }

  /**
   * 清除历史记录
   */
  function clearHistory(): void {
    store.clearHistory()
  }

  /**
   * 刷新活动窗口信息
   */
  async function refreshActiveWindow(): Promise<void> {
    await store.refreshActiveWindow()
  }

  /**
   * 检查消息是否应触发视觉分析
   * @param message 消息内容
   */
  function shouldTriggerFromMessage(message: string): boolean {
    return store.shouldTriggerFromMessage(message)
  }

  // ============ 快捷操作 ============

  /**
   * 询问屏幕内容
   * @param question 问题
   */
  async function ask(question: string): Promise<string | null> {
    const result = await captureAndAnalyze(question)
    return result?.analysis.description || null
  }

  /**
   * 描述当前屏幕
   */
  async function describe(): Promise<string | null> {
    const result = await captureAndAnalyze('请描述当前屏幕的内容')
    return result?.analysis.description || null
  }

  /**
   * 从屏幕提取信息
   * @param query 提取查询
   */
  async function extract<T = unknown>(query: string): Promise<T | null> {
    const result = await captureAndAnalyze(`请从屏幕提取以下信息：${query}，并以 JSON 格式返回`)
    if (result?.analysis.extractedData) {
      return result.analysis.extractedData as T
    }
    return null
  }

  // ============ 返回 ============

  return {
    // 状态
    config,
    isEnabled,
    isReady,
    isCapturing,
    isAnalyzing,
    isProcessing,
    lastScreenshot,
    lastAnalysis,
    error,
    canAnalyze,
    hasApiKey,
    history,
    activeWindow,

    // 方法
    init,
    capture,
    analyze,
    captureAndAnalyze,
    enable,
    disable,
    toggle,
    updateConfig,
    setModel,
    setApiKey,
    setTriggerMode,
    clearError,
    clearResult,
    clearHistory,
    refreshActiveWindow,
    shouldTriggerFromMessage,

    // 快捷操作
    ask,
    describe,
    extract,
  }
}

/**
 * 使用视觉触发器
 * 提供视觉触发按钮的相关功能
 */
export function useVisionTrigger() {
  const store = useVisionStore()
  const { captureAndAnalyze, isProcessing, canAnalyze } = useVision()

  /**
   * 触发视觉分析
   */
  async function trigger(prompt?: string): Promise<boolean> {
    if (!canAnalyze.value) {
      return false
    }

    const result = await captureAndAnalyze(prompt)
    return result !== null
  }

  /**
   * 获取按钮状态
   */
  const buttonState = computed(() => {
    if (isProcessing.value) {
      return 'loading'
    }
    if (!store.isEnabled) {
      return 'disabled'
    }
    if (!store.hasApiKey) {
      return 'needs-config'
    }
    return 'ready'
  })

  /**
   * 获取按钮提示文本
   */
  const buttonTooltip = computed(() => {
    switch (buttonState.value) {
      case 'loading':
        return '正在分析屏幕...'
      case 'disabled':
        return '视觉功能未启用'
      case 'needs-config':
        return '请先配置视觉模型和 API 密钥'
      case 'ready':
        return '点击分析当前屏幕'
      default:
        return ''
    }
  })

  return {
    trigger,
    buttonState,
    buttonTooltip,
    isProcessing,
    canAnalyze,
  }
}

/**
 * 使用视觉语音控制
 * 提供语音触发视觉分析的功能
 */
export function useVisionVoice() {
  const store = useVisionStore()
  const { captureAndAnalyze: _captureAndAnalyze } = useVision()

  const isListening = computed(() => store.isListeningForVoice)

  /**
   * 开始监听语音指令
   */
  function startListening(): void {
    store.startVoiceListening()
  }

  /**
   * 停止监听语音指令
   */
  function stopListening(): void {
    store.stopVoiceListening()
  }

  /**
   * 切换监听状态
   */
  function toggleListening(): void {
    if (isListening.value) {
      stopListening()
    }
    else {
      startListening()
    }
  }

  /**
   * 处理语音指令
   * @param command 语音指令文本
   */
  async function handleCommand(command: string): Promise<boolean> {
    return await store.handleVoiceCommand(command)
  }

  /**
   * 检查指令是否包含视觉命令
   * @param message 消息内容
   */
  function containsVisionCommand(message: string): boolean {
    return store.shouldTriggerFromMessage(message)
  }

  return {
    isListening,
    startListening,
    stopListening,
    toggleListening,
    handleCommand,
    containsVisionCommand,
  }
}

/**
 * 使用视觉面板
 * 提供视觉面板相关的功能
 */
export function useVisionPanel() {
  const store = useVisionStore()
  const vision = useVision()

  const screenshot = computed(() => store.lastScreenshot)
  const analysis = computed(() => store.lastAnalysis)
  const hasResult = computed(() => !!store.lastScreenshot || !!store.lastAnalysis)

  /**
   * 重新分析当前截图
   */
  async function reanalyze(prompt?: string): Promise<boolean> {
    if (!store.lastScreenshot) {
      return false
    }

    const result = await vision.analyze(prompt)
    return result !== null
  }

  /**
   * 保存截图
   */
  async function saveScreenshot(): Promise<void> {
    if (!store.lastScreenshot) {
      return
    }

    // 创建下载链接
    const link = document.createElement('a')
    link.href = `data:image/png;base64,${store.lastScreenshot}`
    link.download = `screenshot-${Date.now()}.png`
    link.click()
  }

  /**
   * 复制分析结果
   */
  async function copyAnalysis(): Promise<boolean> {
    if (!store.lastAnalysis) {
      return false
    }

    try {
      await navigator.clipboard.writeText(store.lastAnalysis.description)
      return true
    }
    catch {
      return false
    }
  }

  return {
    screenshot,
    analysis,
    hasResult,
    reanalyze,
    saveScreenshot,
    copyAnalysis,
    clearResult: vision.clearResult,
  }
}

/**
 * 在组件挂载时自动初始化视觉功能
 */
export function useVisionAutoInit() {
  const { init } = useVision()

  onMounted(() => {
    init()
  })
}

// 默认导出
export default useVision
