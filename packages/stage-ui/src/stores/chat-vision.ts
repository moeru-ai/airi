/**
 * 聊天视觉集成 Store
 * 扩展聊天功能以支持视觉上下文
 */

import type { AnalysisResult } from '../../../apps/stage-tamagotchi/src/shared/vision'

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { useVisionStore } from './vision'

// 视觉消息类型
export interface VisionMessage {
  type: 'vision'
  screenshot: string
  analysis?: AnalysisResult
  prompt?: string
  timestamp: number
}

// 带视觉上下文的聊天消息
export interface ChatMessageWithVision {
  id: string
  role: 'user' | 'assistant'
  content: string
  visionContext?: VisionMessage
  timestamp: number
}

export const useChatVisionStore = defineStore('chatVision', () => {
  // 引用视觉 Store
  const visionStore = useVisionStore()

  // ============ State ============

  // 是否自动附加视觉上下文
  const autoAttachVision = ref(false)

  // 视觉上下文缓存（用于当前对话）
  const visionContextCache = ref<VisionMessage | null>(null)

  // 待处理的视觉触发（用户发送了包含视觉指令的消息）
  const pendingVisionTrigger = ref(false)

  // 视觉功能开关
  const visionEnabled = computed(() => visionStore.isEnabled)

  // ============ Getters ============

  /**
   * 是否有可用的视觉上下文
   */
  const hasVisionContext = computed(() => {
    return !!visionContextCache.value || !!visionStore.lastScreenshot
  })

  /**
   * 当前视觉上下文
   */
  const currentVisionContext = computed((): VisionMessage | null => {
    if (visionContextCache.value) {
      return visionContextCache.value
    }

    if (visionStore.lastScreenshot) {
      return {
        type: 'vision',
        screenshot: visionStore.lastScreenshot,
        analysis: visionStore.lastAnalysis,
        timestamp: Date.now(),
      }
    }

    return null
  })

  /**
   * 最后截图的 base64
   */
  const lastScreenshot = computed(() => visionStore.lastScreenshot)

  /**
   * 最后分析结果
   */
  const lastAnalysis = computed(() => visionStore.lastAnalysis)

  // ============ Actions ============

  /**
   * 检查消息是否包含视觉指令
   * @param message 消息内容
   */
  function containsVisionCommand(message: string): boolean {
    return visionStore.shouldTriggerFromMessage(message)
  }

  /**
   * 触发视觉分析并缓存结果
   * @param prompt 分析提示
   */
  async function captureAndCache(prompt?: string): Promise<VisionMessage | null> {
    const result = await visionStore.captureAndAnalyze(prompt)

    if (result) {
      const visionMessage: VisionMessage = {
        type: 'vision',
        screenshot: result.screenshot,
        analysis: result.analysis,
        prompt,
        timestamp: Date.now(),
      }

      visionContextCache.value = visionMessage
      return visionMessage
    }

    return null
  }

  /**
   * 处理用户消息
   * 如果消息包含视觉指令，触发视觉分析
   * @param message 用户消息
   */
  async function processUserMessage(message: string): Promise<{
    shouldTriggerVision: boolean
    visionContext?: VisionMessage
  }> {
    const shouldTrigger = containsVisionCommand(message)

    if (shouldTrigger && visionEnabled.value) {
      pendingVisionTrigger.value = true
      const context = await captureAndCache(message)
      pendingVisionTrigger.value = false

      return {
        shouldTriggerVision: true,
        visionContext: context || undefined,
      }
    }

    return {
      shouldTriggerVision: false,
    }
  }

  /**
   * 构建带视觉上下文的系统提示词
   * @param basePrompt 基础提示词
   * @param visionContext 视觉上下文
   */
  function buildVisionPrompt(basePrompt: string, visionContext: VisionMessage): string {
    let prompt = basePrompt

    prompt += '\n\n[视觉上下文]\n'
    prompt += '用户分享了一张屏幕截图。'

    if (visionContext.analysis?.description) {
      prompt += `\n屏幕内容描述：${visionContext.analysis.description}`
    }

    if (visionContext.prompt) {
      prompt += `\n用户的问题：${visionContext.prompt}`
    }

    prompt += '\n请基于以上屏幕内容回答用户的问题。'

    return prompt
  }

  /**
   * 将视觉上下文转换为聊天附件格式
   * @param visionContext 视觉上下文
   */
  function visionToAttachment(visionContext: VisionMessage): {
    type: 'image'
    data: string
    mimeType: string
  } {
    return {
      type: 'image',
      data: visionContext.screenshot,
      mimeType: 'image/png',
    }
  }

  /**
   * 清除视觉上下文缓存
   */
  function clearVisionCache(): void {
    visionContextCache.value = null
  }

  /**
   * 设置自动附加视觉上下文
   * @param enabled 是否启用
   */
  function setAutoAttach(enabled: boolean): void {
    autoAttachVision.value = enabled
  }

  /**
   * 手动触发视觉分析
   * @param prompt 分析提示
   */
  async function triggerVision(prompt?: string): Promise<VisionMessage | null> {
    return await captureAndCache(prompt)
  }

  /**
   * 获取视觉状态描述
   */
  function getVisionStatus(): string {
    if (!visionEnabled.value) {
      return '视觉功能未启用'
    }

    if (pendingVisionTrigger.value) {
      return '正在分析屏幕...'
    }

    if (hasVisionContext.value) {
      return '视觉上下文可用'
    }

    return '视觉功能就绪'
  }

  // ============ Return ============

  return {
    // State
    autoAttachVision,
    pendingVisionTrigger,

    // Getters
    visionEnabled,
    hasVisionContext,
    currentVisionContext,
    lastScreenshot,
    lastAnalysis,

    // Actions
    containsVisionCommand,
    captureAndCache,
    processUserMessage,
    buildVisionPrompt,
    visionToAttachment,
    clearVisionCache,
    setAutoAttach,
    triggerVision,
    getVisionStatus,
  }
})

// 导出类型
export type ChatVisionStore = ReturnType<typeof useChatVisionStore>
