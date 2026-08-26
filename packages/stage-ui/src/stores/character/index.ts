import type { IntentHandle } from '@proj-airi/pipelines-audio'

import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { computed, reactive, ref } from 'vue'

import { useLlmmarkerParser } from '../../composables/llm-marker-parser'
import { useAiriCardStore } from '../modules'
import { useSpeechRuntimeStore } from '../speech-runtime'

export * from './notebook'
export * from './orchestrator'

export interface CharacterSparkNotifyReaction {
  createdAt: number
  id: string
  message: string
  metadata?: Record<string, unknown>
  sourceEventId?: string
}

interface StreamingReactionState {
  intent: IntentHandle
  parser: ReturnType<ParserFactory>
  reaction: CharacterSparkNotifyReaction
}

const MAX_REACTIONS = 200
type ParserFactory = typeof useLlmmarkerParser
let parserFactory: ParserFactory = useLlmmarkerParser

export function setCharacterLlmMarkerParserFactoryForTest(factory: null | ParserFactory) {
  parserFactory = factory ?? useLlmmarkerParser
}

export const useCharacterStore = defineStore('character', () => {
  const { activeCard, systemPrompt } = storeToRefs(useAiriCardStore())

  const name = computed(() => activeCard.value?.name ?? '')
  const ownerId = computed(() => activeCard.value?.name ?? 'default')

  const reactions = ref<CharacterSparkNotifyReaction[]>([])
  const streamingReactions = ref<Map<string, StreamingReactionState>>(new Map())
  const speechRuntimeStore = useSpeechRuntimeStore()

  async function emitTextOutput(text: string) {
    const intent = speechRuntimeStore.openIntent({
      behavior: 'queue',
      ownerId: ownerId.value,
      priority: 'normal',
    })

    const parser = parserFactory({
      onLiteral: async (literal) => {
        if (literal)
          intent.writeLiteral(literal)
      },
      onSpecial: async (special) => {
        if (special)
          intent.writeSpecial(special)
      },
    })

    await parser.consume(text)
    await parser.end()

    intent.writeFlush()
    intent.end()
  }

  function onSparkNotifyReactionStreamEvent(sparkEventId: string, chunk: string, options?: { metadata?: Record<string, unknown> }) {
    if (!streamingReactions.value.has(sparkEventId)) {
      const newReaction = reactive({
        createdAt: Date.now(),
        id: nanoid(),
        message: '',
        metadata: options?.metadata,
        sourceEventId: sparkEventId,
      }) satisfies CharacterSparkNotifyReaction

      const intent = speechRuntimeStore.openIntent({
        behavior: 'interrupt',
        intentId: `spark:${sparkEventId}`,
        ownerId: ownerId.value,
        priority: 'high',
        turnId: `spark:${sparkEventId}`,
      })

      const parser = parserFactory({
        onLiteral: async (literal) => {
          if (literal)
            intent.writeLiteral(literal)
        },
        onSpecial: async (special) => {
          if (special)
            intent.writeSpecial(special)
        },
      })

      streamingReactions.value.set(sparkEventId, { intent, parser, reaction: newReaction })
    }

    const state = streamingReactions.value.get(sparkEventId)!
    state.reaction.message += chunk
    void state.parser.consume(chunk)
  }

  function onSparkNotifyReactionStreamEnd(sparkEventId: string, fullText: string, options?: { metadata?: Record<string, unknown> }) {
    const state = streamingReactions.value.get(sparkEventId)
    if (!state)
      return

    state.reaction.message = fullText
    recordSparkNotifyReaction(sparkEventId, fullText, { metadata: options?.metadata })

    void state.parser.end().then(() => {
      state.intent.writeFlush()
      state.intent.end()
      streamingReactions.value.delete(sparkEventId)
    })
  }

  function recordSparkNotifyReaction(sparkEventId: string, message: string, options?: { metadata?: Record<string, unknown> }) {
    const newReaction = {
      createdAt: Date.now(),
      id: nanoid(),
      message,
      metadata: options?.metadata,
      sourceEventId: sparkEventId,
    } satisfies CharacterSparkNotifyReaction

    reactions.value.push(newReaction)

    if (reactions.value.length > MAX_REACTIONS) {
      reactions.value.splice(0, reactions.value.length - MAX_REACTIONS)
    }
  }

  function clearReactions() {
    reactions.value = []
  }

  return {
    clearReactions,
    emitTextOutput,
    name,

    onSparkNotifyReactionStreamEnd,
    onSparkNotifyReactionStreamEvent,
    reactions,
    recordSparkNotifyReaction,

    systemPrompt,
  }
})
