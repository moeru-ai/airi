import type { PatternDisruptorBuildResult, PatternDisruptorSettingsInput } from '@proj-airi/pattern-disruptor'

import type { ChatHistoryItem } from '../types/chat'

import { buildPatternDisruptorSupplement, resolvePatternDisruptorSettings } from '@proj-airi/pattern-disruptor'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { extractMessageText } from '../libs/chat-sync'

export interface PreparePatternDisruptorTurnInput {
  settings?: PatternDisruptorSettingsInput
  messageText: string
  sessionMessages: ChatHistoryItem[]
}

export const usePatternDisruptorStore = defineStore('pattern-disruptor', () => {
  const preparedSupplement = ref('')
  const lastResult = ref<PatternDisruptorBuildResult | undefined>()
  const wordHistory = ref<string[]>([])

  function prepareForUserTurn(input: PreparePatternDisruptorTurnInput) {
    const settings = resolvePatternDisruptorSettings(input.settings)

    if (!settings.enabled) {
      preparedSupplement.value = ''
      lastResult.value = undefined
      return
    }

    const assistantMessages = input.sessionMessages
      .filter((message) => message.role === 'assistant')
      .map((message) => extractMessageText(message))
      .filter(Boolean)

    const result = buildPatternDisruptorSupplement({
      settings,
      userMessage: input.messageText,
      assistantMessages,
      wordHistory: wordHistory.value,
    })

    preparedSupplement.value = result.text
    lastResult.value = result

    if (result.words.length > 0 && settings.randomWords.wordHistorySize > 0) {
      const nextHistory = [...wordHistory.value, ...result.words.map((word) => word.toLowerCase())]
      wordHistory.value = nextHistory.slice(-settings.randomWords.wordHistorySize)
    }
  }

  function clearPreparedSupplement() {
    preparedSupplement.value = ''
    lastResult.value = undefined
  }

  function resetState() {
    clearPreparedSupplement()
    wordHistory.value = []
  }

  return {
    activePromptSupplement: computed(() => preparedSupplement.value),
    lastResult: computed(() => lastResult.value),
    wordHistory: computed(() => wordHistory.value),
    prepareForUserTurn,
    clearPreparedSupplement,
    resetState,
  }
})
