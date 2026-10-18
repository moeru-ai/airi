import type { SpeechClient } from '../../services/speech/speech-client'

import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { computed, reactive, ref } from 'vue'

import { useLlmmarkerParser } from '../../composables/llm-marker-parser'
import { SpeechClient as Speech } from '../../services/speech/speech-client'
import { useChatSessionStore } from '../chat/session-store'
import { useAiriCardStore } from '../modules'

export * from './notebook'
export * from './orchestrator'

export interface CharacterSparkNotifyReaction {
  id: string
  message: string
  createdAt: number
  sourceEventId?: string
  metadata?: Record<string, unknown>
}

interface StreamingReactionState {
  reaction: CharacterSparkNotifyReaction
  speech: SpeechClient
  parser: ReturnType<ParserFactory>
}

const MAX_REACTIONS = 200
type ParserFactory = typeof useLlmmarkerParser
let parserFactory: ParserFactory = useLlmmarkerParser

export function setCharacterLlmMarkerParserFactoryForTest(factory: ParserFactory | null) {
  parserFactory = factory ?? useLlmmarkerParser
}

export const useCharacterStore = defineStore('character', () => {
  const { activeCard, systemPrompt } = storeToRefs(useAiriCardStore())

  const name = computed(() => activeCard.value?.name ?? '')

  const reactions = ref<CharacterSparkNotifyReaction[]>([])
  const streamingReactions = ref<Map<string, StreamingReactionState>>(new Map())
  const sessions = useChatSessionStore()

  async function emitTextOutput(text: string) {
    const speech = new Speech({ sessionId: sessions.activeSessionId, turnId: nanoid() }, 'read-aloud')

    const parser = parserFactory({
      onLiteral: async (literal) => {
        if (literal)
          await speech.write(literal)
      },
      onSpecial: async (special) => {
        if (special)
          await speech.special(special)
      },
    })

    await parser.consume(text)
    await parser.end()

    await speech.end()
    void speech.finish().catch(error => console.error('Speech output failed', error))
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

      const speech = new Speech({ sessionId: sessions.activeSessionId, turnId: `spark:${sparkEventId}` }, 'notification')

      const parser = parserFactory({
        onLiteral: async (literal) => {
          if (literal)
            await speech.write(literal)
        },
        onSpecial: async (special) => {
          if (special)
            await speech.special(special)
        },
      })

      streamingReactions.value.set(sparkEventId, { reaction: newReaction, speech, parser })
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

    void state.parser.end().then(async () => {
      await state.speech.end()
      streamingReactions.value.delete(sparkEventId)
      await state.speech.finish()
    }).catch(error => console.error('Notification speech failed', error))
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
