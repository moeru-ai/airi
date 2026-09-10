import type { IntentHandle } from '@proj-airi/pipelines-audio'

import type { BilingualTurn } from '../../libs/bilingual/turn'

import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { computed, reactive, ref } from 'vue'

import { useLlmmarkerParser } from '../../composables/llm-marker-parser'
import { useSparkTranslationChannel } from '../../composables/use-spark-translation-channel'
import { projectBilingualText } from '../../libs/bilingual/parser'
import { createBilingualTurn } from '../../libs/bilingual/turn'
import { useAiriCardStore } from '../modules'
import { useSettingsBilingual } from '../settings/bilingual'
import { useSpeechRuntimeStore } from '../speech-runtime'

export * from './notebook'
export * from './orchestrator'

/**
 * Prefix of the speech turn a spark reaction plays as. The stage uses it to
 * tell a reaction's playback item apart from a chat turn's.
 */
export const SPARK_TURN_ID_PREFIX = 'spark:'

export interface CharacterSparkNotifyReaction {
  id: string
  message: string
  createdAt: number
  sourceEventId?: string
  metadata?: Record<string, unknown>
}

interface StreamingReactionState {
  reaction: CharacterSparkNotifyReaction
  intent: IntentHandle
  parser: ReturnType<ParserFactory>
  /**
   * Splits tagged model output into the spoken line and sentence pairs. Present
   * only while bilingual subtitles are on.
   */
  bilingualTurn?: BilingualTurn
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
  const ownerId = computed(() => activeCard.value?.name ?? 'default')

  const reactions = ref<CharacterSparkNotifyReaction[]>([])
  const streamingReactions = ref<Map<string, StreamingReactionState>>(new Map())
  const speechRuntimeStore = useSpeechRuntimeStore()
  const bilingualStore = useSettingsBilingual()
  const { post: postSparkPair } = useSparkTranslationChannel()

  async function emitTextOutput(text: string) {
    const intent = speechRuntimeStore.openIntent({
      ownerId: ownerId.value,
      priority: 'normal',
      behavior: 'queue',
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
        id: nanoid(),
        message: '',
        createdAt: Date.now(),
        sourceEventId: sparkEventId,
        metadata: options?.metadata,
      }) satisfies CharacterSparkNotifyReaction

      const intent = speechRuntimeStore.openIntent({
        turnId: `${SPARK_TURN_ID_PREFIX}${sparkEventId}`,
        intentId: `${SPARK_TURN_ID_PREFIX}${sparkEventId}`,
        ownerId: ownerId.value,
        priority: 'high',
        behavior: 'interrupt',
      })

      // Bilingual output labels every segment, so it has to be split before it
      // reaches the speech engine: the control tags would be read aloud and
      // shown in the caption line, and the translation has no chat bubble of
      // its own to render in.
      let bilingualTurn: BilingualTurn | undefined
      if (bilingualStore.enabled) {
        const turnId = `${SPARK_TURN_ID_PREFIX}${sparkEventId}`

        // The pairs are broadcast instead of captioned here: the model finishes
        // long before the audio does, and only the window hosting the speech
        // pipeline knows which sentence is being spoken right now.
        bilingualTurn = createBilingualTurn({
          languages: bilingualStore.subtitleLanguages,
          ttsLanguage: bilingualStore.ttsLanguage,
          onSpoken: (text) => {
            intent.writeLiteral(text)
            newReaction.message += text
          },
          onPair: (pair) => {
            try {
              postSparkPair({ turnId, ...pair })
            }
            catch {
              // BroadcastChannel may be closed - don't break the reaction
            }
          },
        })
      }

      const parser = parserFactory({
        onLiteral: async (literal) => {
          if (!literal)
            return

          if (bilingualTurn)
            bilingualTurn.push(literal)
          else
            intent.writeLiteral(literal)
        },
        onSpecial: async (special) => {
          if (special)
            intent.writeSpecial(special)
        },
      })

      streamingReactions.value.set(sparkEventId, { reaction: newReaction, intent, parser, bilingualTurn })
    }

    const state = streamingReactions.value.get(sparkEventId)!
    // While bilingual is on the message is filled in by the split above, which
    // is the only place that knows which part of the output is spoken.
    if (!state.bilingualTurn)
      state.reaction.message += chunk
    void state.parser.consume(chunk)
  }

  function onSparkNotifyReactionStreamEnd(sparkEventId: string, fullText: string, options?: { metadata?: Record<string, unknown> }) {
    const state = streamingReactions.value.get(sparkEventId)
    if (!state)
      return

    // Reactions are handed back to the module that requested them, so the
    // stored text must not keep the `[EN]`/`[CN]` control tags. Recording stays
    // synchronous: the caller reads it back as soon as the agent turn resolves.
    const text = state.bilingualTurn
      ? projectBilingualText(fullText, bilingualStore.subtitleLanguages, bilingualStore.ttsLanguage)
      : fullText

    state.reaction.message = text
    recordSparkNotifyReaction(sparkEventId, text, { metadata: options?.metadata })

    // The marker parser delivers literals asynchronously and only drains here, so
    // the split has to end after it: ending first closes the trailing sentence
    // with whatever arrived so far and broadcasts half of its translation.
    void state.parser.end().then(() => {
      state.bilingualTurn?.end()
      state.intent.writeFlush()
      state.intent.end()
      streamingReactions.value.delete(sparkEventId)
    })
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
