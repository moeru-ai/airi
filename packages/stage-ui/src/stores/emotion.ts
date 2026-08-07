/**
 * Emotion Store
 * 情绪状态存储和管理
 */

import type { EmotionDelta, EmotionEvent, EmotionState } from '../types/emotion'

import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { applyDelta, applyTimeDecay, createEmotionState } from '../utils/emotionState'

const EMOTION_STATES_STORAGE_KEY = 'emotion/states'
const EMOTION_EVENTS_STORAGE_KEY = 'emotion/events'

export const useEmotionStore = defineStore('emotion', () => {
  // 存储所有会话的情绪状态
  const emotionStatesMap = useLocalStorageManualReset<Record<string, EmotionState>>(
    EMOTION_STATES_STORAGE_KEY,
    {},
  )

  // 存储所有情绪事件
  const emotionEventsMap = useLocalStorageManualReset<Record<string, EmotionEvent[]>>(
    EMOTION_EVENTS_STORAGE_KEY,
    {},
  )

  // 当前会话 ID（从 chat store 获取）
  const currentSessionId = ref<string>('default')

  // 获取当前会话的情绪状态
  const currentEmotionState = computed(() => {
    const state = emotionStatesMap.value[currentSessionId.value]
    if (!state) {
      // 如果不存在，创建默认状态
      const newState = createEmotionState()
      emotionStatesMap.value[currentSessionId.value] = newState
      return newState
    }
    return state
  })

  // 获取当前会话的情绪事件
  const currentEmotionEvents = computed(() => {
    return emotionEventsMap.value[currentSessionId.value] || []
  })

  /**
   * 加载情绪状态
   */
  function loadEmotionState(sessionId: string): EmotionState | undefined {
    let state = emotionStatesMap.value[sessionId]

    if (state) {
      // 应用时间衰减
      state = applyTimeDecay(state, Date.now())
      emotionStatesMap.value[sessionId] = state
    }

    return state
  }

  /**
   * 保存情绪状态
   */
  function saveEmotionState(sessionId: string, state: EmotionState): void {
    emotionStatesMap.value[sessionId] = state
  }

  /**
   * 应用情绪变化
   */
  function applyEmotionDelta(
    sessionId: string,
    delta: EmotionDelta,
    reason: string,
    messageId?: string,
  ): EmotionState {
    const currentState = emotionStatesMap.value[sessionId] || createEmotionState()
    const newState = applyDelta(currentState, delta, Date.now())

    // 保存新状态
    saveEmotionState(sessionId, newState)

    // 记录事件
    appendEmotionEvent(sessionId, delta, reason, messageId)

    return newState
  }

  /**
   * 添加情绪事件
   */
  function appendEmotionEvent(
    sessionId: string,
    delta: EmotionDelta,
    reason: string,
    messageId?: string,
  ): void {
    const event: EmotionEvent = {
      id: nanoid(),
      sessionId,
      timestamp: Date.now(),
      delta,
      reason,
      messageId,
    }

    if (!emotionEventsMap.value[sessionId]) {
      emotionEventsMap.value[sessionId] = []
    }

    emotionEventsMap.value[sessionId].push(event)

    // 限制事件数量（保留最近 100 条）
    const events = emotionEventsMap.value[sessionId]
    if (events.length > 100) {
      emotionEventsMap.value[sessionId] = events.slice(-100)
    }
  }

  /**
   * 获取最近的情绪事件
   */
  function getRecentEvents(sessionId: string, count: number = 10): EmotionEvent[] {
    const events = emotionEventsMap.value[sessionId] || []
    return events.slice(-count)
  }

  /**
   * 重置会话的情绪状态
   */
  function resetSessionEmotion(sessionId: string): void {
    emotionStatesMap.value[sessionId] = createEmotionState()
    emotionEventsMap.value[sessionId] = []
  }

  /**
   * 清理所有情绪数据
   */
  function resetState(): void {
    emotionStatesMap.reset()
    emotionEventsMap.reset()
  }

  /**
   * 设置当前会话 ID
   */
  function setCurrentSession(sessionId: string): void {
    currentSessionId.value = sessionId
  }

  return {
    // State
    currentSessionId,
    currentEmotionState,
    currentEmotionEvents,

    // Actions
    loadEmotionState,
    saveEmotionState,
    applyEmotionDelta,
    appendEmotionEvent,
    getRecentEvents,
    resetSessionEmotion,
    resetState,
    setCurrentSession,
  }
})
