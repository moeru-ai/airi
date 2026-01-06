import type { TextSegmentationItem } from '../composables/queues'

import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { computed, reactive, ref } from 'vue'

import { usePipelineWorkflowTextSegmentationStore } from '../composables/queues'
import { TTS_FLUSH_INSTRUCTION } from '../utils/tts'
import { useAiriCardStore } from './modules'

export interface CharacterSparkNotifyReaction {
  id: string
  message: string
  createdAt: number
  sourceEventId?: string
  metadata?: Record<string, unknown>
}

const MAX_REACTIONS = 200

export const useCharacterStore = defineStore('character', () => {
  const { activeCard, systemPrompt } = storeToRefs(useAiriCardStore())
  const textSegmentationStore = usePipelineWorkflowTextSegmentationStore()
  const { textSegmentationQueue } = storeToRefs(textSegmentationStore)

  const name = computed(() => activeCard.value?.name ?? '')
  const reactions = ref<CharacterSparkNotifyReaction[]>([])
  const streamingReactions = ref<Map<string, CharacterSparkNotifyReaction>>(new Map())

  function emitTextOutput(text: string) {
    textSegmentationQueue.value.enqueue({ type: 'literal', value: text } as TextSegmentationItem)
  }

  function onSparkNotifyReactionStreamEvent(sparkEventId: string, chunk: string, options?: { metadata?: Record<string, unknown> }) {
    if (!streamingReactions.value.has(sparkEventId)) {
      const newReaction = reactive({
        id: nanoid(),
        message: '',
        createdAt: Date.now(),
        sourceEventId: sparkEventId,
        metadata: options?.metadata,
      }) satisfies CharacterSparkNotifyReaction

      streamingReactions.value.set(sparkEventId, newReaction)
    }

    const reaction = streamingReactions.value.get(sparkEventId)!
    reaction.message += chunk

    emitTextOutput(chunk)
  }

  function onSparkNotifyReactionStreamEnd(sparkEventId: string, fullText: string, options?: { metadata?: Record<string, unknown> }) {
    if (!streamingReactions.value.has(sparkEventId)) {
      return
    }

    const reaction = streamingReactions.value.get(sparkEventId)!
    reaction.message = fullText
    recordSparkNotifyReaction(sparkEventId, fullText, { metadata: options?.metadata })

    streamingReactions.value.delete(sparkEventId)

    emitTextOutput(`${TTS_FLUSH_INSTRUCTION}${TTS_FLUSH_INSTRUCTION}`)
  }

  function recordSparkNotifyReaction(sparkEventId: string, message: string, options?: { metadata?: Record<string, unknown> }) {
    const newReaction = {
      id: nanoid(),
      message,
      createdAt: Date.now(),
      sourceEventId: sparkEventId,
      metadata: options?.metadata,
    } satisfies CharacterSparkNotifyReaction

    reactions.value.push(newReaction)

    // Trim reactions if exceeding max limit
    if (reactions.value.length > MAX_REACTIONS) {
      reactions.value.splice(0, reactions.value.length - MAX_REACTIONS)
    }
  }

  function clearReactions() {
    reactions.value = []
  }

  return {
    name,
    reactions,
    systemPrompt,

    recordSparkNotifyReaction,
    onSparkNotifyReactionStreamEvent,
    onSparkNotifyReactionStreamEnd,
    clearReactions,

    emitTextOutput,
  }
})
