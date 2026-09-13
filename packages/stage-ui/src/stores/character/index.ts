import type { BilingualTurnSplitter, IntentHandle } from '@proj-airi/pipelines-audio'

import { createBilingualTurnSplitter, TTS_FLUSH_INSTRUCTION } from '@proj-airi/pipelines-audio'
import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { computed, reactive, ref } from 'vue'

import { useLlmmarkerParser } from '../../composables/llm-marker-parser'
import { useBilingualCaptionBus } from '../../services/bilingual-captions'
import { useAiriCardStore } from '../modules'
import { useSettingsBilingualSubtitles } from '../settings/bilingual-subtitles'
import { useSpeechRuntimeStore } from '../speech-runtime'

export * from './notebook'
export * from './orchestrator'

export interface CharacterSparkNotifyReaction {
  id: string
  message: string
  createdAt: number
  sourceEventId?: string
  metadata?: Record<string, unknown>
}

interface ReactionBilingualState {
  /** Per-reaction splitter. Undefined when bilingual mode is off. */
  splitter: BilingualTurnSplitter
  /** Caption bus turn id, same value as the speech intent turnId. */
  turnId: string
  /** Spoken projection accumulated for the final reaction message. */
  spokenText: string
  /** ISO 639-1 code of the translation language, for caption payloads. */
  translationLanguage: string
}

interface StreamingReactionState {
  reaction: CharacterSparkNotifyReaction
  intent: IntentHandle
  parser: ReturnType<ParserFactory>
  bilingual?: ReactionBilingualState
}

const MAX_REACTIONS = 200
type ParserFactory = typeof useLlmmarkerParser
let parserFactory: ParserFactory = useLlmmarkerParser

export function setCharacterLlmMarkerParserFactoryForTest(factory: ParserFactory | null) {
  parserFactory = factory ?? useLlmmarkerParser
}

export const useCharacterStore = defineStore('character', () => {
  const { activeCard, systemPrompt } = storeToRefs(useAiriCardStore())
  const bilingualSettings = useSettingsBilingualSubtitles()
  const bilingualCaptionBus = useBilingualCaptionBus()
  // Spark reactions interrupt earlier speech. Track active turn ids so the
  // previous reaction's caption line is cleared when a new one starts.
  const activeSparkTurnIds = new Set<string>()

  const name = computed(() => activeCard.value?.name ?? '')
  const ownerId = computed(() => activeCard.value?.name ?? 'default')

  const reactions = ref<CharacterSparkNotifyReaction[]>([])
  const streamingReactions = ref<Map<string, StreamingReactionState>>(new Map())
  const speechRuntimeStore = useSpeechRuntimeStore()

  /**
   * Splits one text block through the bilingual splitter.
   * Returns spoken fragments for the marker parser and TTS. Spoken and
   * translation fragments reach the caption bus in wire order, and a flush
   * instruction marks each pair boundary in the TTS chunker so one spoken
   * sentence becomes one playback item.
   */
  function splitBilingualText(
    splitter: BilingualTurnSplitter | undefined,
    turnId: string,
    text: string,
    translationLanguage: string,
    flush?: () => void,
  ): string {
    if (!splitter)
      return text

    let spoken = ''
    for (const event of splitter.consume(text)) {
      if (event.kind === 'spoken') {
        spoken += event.text
        bilingualCaptionBus.ingestSpoken(turnId)
      }
      else {
        flush?.()
        bilingualCaptionBus.ingestTranslation(turnId, {
          language: translationLanguage,
          pairId: event.pairId,
          text: event.text,
        })
      }
    }
    return spoken
  }

  async function emitTextOutput(text: string) {
    // Plugin-emitted text can carry bilingual tags after a spark request
    // injected the format instruction. Give it a turn id so playback pairing
    // and the caption bus can handle it like a reaction.
    const snapshot = bilingualSettings.snapshot()
    const turnId = `spark:direct:${nanoid()}`
    const splitter = snapshot ? createBilingualTurnSplitter() : undefined

    const intent = speechRuntimeStore.openIntent({
      turnId: splitter ? turnId : undefined,
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

    if (splitter && snapshot) {
      // splitBilingualText already ingests both tracks into the caption bus
      // in wire order and flushes the chunker at each pair boundary.
      const spoken = splitBilingualText(
        splitter,
        turnId,
        text,
        snapshot.translationLanguage,
        () => intent.writeLiteral(TTS_FLUSH_INSTRUCTION),
      )
      await parser.consume(spoken)
    }
    else {
      await parser.consume(text)
    }
    await parser.end()

    // Leftover translations are flushed by the speech pipeline's onTurnEnd
    // and the playback manager's intent-drained event, once audio actually
    // finishes — not here at text end.

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

      // Read bilingual settings once per reaction. Mid-reaction settings
      // changes cannot leak brackets into TTS or pair the wrong translation.
      const snapshot = bilingualSettings.snapshot()
      const turnId = `spark:${sparkEventId}`
      const bilingual = snapshot
        ? { splitter: createBilingualTurnSplitter(), turnId, spokenText: '', translationLanguage: snapshot.translationLanguage }
        : undefined
      if (bilingual) {
        for (const previousTurnId of activeSparkTurnIds)
          bilingualCaptionBus.resetTurn(previousTurnId)
        activeSparkTurnIds.clear()
        activeSparkTurnIds.add(turnId)
      }

      const intent = speechRuntimeStore.openIntent({
        turnId,
        intentId: turnId,
        ownerId: ownerId.value,
        priority: 'high',
        behavior: 'interrupt',
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

      streamingReactions.value.set(sparkEventId, { reaction: newReaction, intent, parser, bilingual })
    }

    const state = streamingReactions.value.get(sparkEventId)!
    if (!state.bilingual) {
      state.reaction.message += chunk
      void state.parser.consume(chunk)
      return
    }

    // Spoken text feeds the marker parser and TTS, and becomes the stored
    // reaction message. Translation text goes to the caption bus only.
    const spoken = splitBilingualText(
      state.bilingual.splitter,
      state.bilingual.turnId,
      chunk,
      state.bilingual.translationLanguage,
      () => state.intent.writeLiteral(TTS_FLUSH_INSTRUCTION),
    )
    state.bilingual.spokenText += spoken
    state.reaction.message += spoken
    if (spoken)
      void state.parser.consume(spoken)
  }

  function onSparkNotifyReactionStreamEnd(sparkEventId: string, fullText: string, options?: { metadata?: Record<string, unknown> }) {
    const state = streamingReactions.value.get(sparkEventId)
    if (!state)
      return

    // With bilingual mode the raw full text contains brackets and
    // translations; persist the spoken projection instead. A final
    // translation block without a closing bracket still reaches the
    // caption bus, while an unclosed candidate stays in the message.
    let persistedText = fullText
    if (state.bilingual) {
      let spokenTail = ''
      for (const event of state.bilingual.splitter.end()) {
        if (event.kind === 'spoken') {
          spokenTail += event.text
        }
        else {
          bilingualCaptionBus.ingestTranslation(state.bilingual.turnId, {
            language: state.bilingual.translationLanguage,
            pairId: event.pairId,
            text: event.text,
          })
        }
      }
      state.bilingual.spokenText += spokenTail
      persistedText = state.bilingual.spokenText
    }
    state.reaction.message = persistedText
    recordSparkNotifyReaction(sparkEventId, persistedText, { metadata: options?.metadata })

    void state.parser.end().then(() => {
      if (state.bilingual)
        activeSparkTurnIds.delete(state.bilingual.turnId)

      // Pairs that playback never reaches are flushed by the pipeline
      // onTurnEnd and the playback intent-drained event, not by a timer.

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
