import type { BilingualTurnEvent, BilingualTurnSplitter } from '@proj-airi/pipelines-audio'

import type { SpeechClient } from '../../services/speech/speech-client'

import { createBilingualTurnSplitter, projectSpokenText, TTS_FLUSH_INSTRUCTION } from '@proj-airi/pipelines-audio'
import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { computed, reactive, ref, shallowRef } from 'vue'

import { useLlmmarkerParser } from '../../composables/llm-marker-parser'
import { getDefinedProvider } from '../../libs/providers/providers'
import { isBufferedStreamingResourceId, resolveStreamingSessionModel } from '../../libs/speech/streaming-buffer'
import { clearSpeechTurnFlags, enableFlushBoundaryTurn, markBufferedSpeechTurn, useBilingualCaptionBus } from '../../services/bilingual-captions'
import { SpeechClient as Speech } from '../../services/speech/speech-client'
import { useChatSessionStore } from '../chat/session-store'
import { useAiriCardStore } from '../modules'
import { useProviderStore } from '../providers/provider'
import { useSettingsBilingualSubtitles } from '../settings/bilingual-subtitles'

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
  /** Undefined when bilingual mode is off; raw text then goes straight in. */
  splitter: BilingualTurnSplitter | undefined
  /** Caption bus turn id, same value as the speech turn id. */
  turnId: string
  /** Label language for the translation caption of this turn. */
  translationLanguage: string | undefined
  /** Whole-session buffered TTS: translation captions cannot align and stay hidden. */
  captionsUnsupported: boolean
}

const MAX_REACTIONS = 200
type ParserFactory = typeof useLlmmarkerParser
let parserFactory: ParserFactory = useLlmmarkerParser

export function setCharacterLlmMarkerParserFactoryForTest(factory: ParserFactory | null) {
  parserFactory = factory ?? useLlmmarkerParser
}

export const useCharacterStore = defineStore('character', () => {
  const cards = useAiriCardStore()
  const { activeCard, systemPrompt } = storeToRefs(cards)
  const sessions = useChatSessionStore()
  const providersStore = useProviderStore()
  const bilingualSettings = useSettingsBilingualSubtitles()
  const bilingualCaptionBus = useBilingualCaptionBus()
  // A new reaction interrupts the previous one, so at most one bilingual
  // turn is active. Clear its caption line when the next one starts.
  let activeBilingualTurnId: string | undefined

  const name = computed(() => activeCard.value?.name ?? '')

  const reactions = ref<CharacterSparkNotifyReaction[]>([])
  // Shallow: values hold SpeechClient and parser instances whose deep
  // unwrapping would erase their class identity. The map is internal (never
  // returned from the store); each reaction object is reactive on its own.
  const streamingReactions = shallowRef<Map<string, StreamingReactionState>>(new Map())

  /**
   * Whether the active speech selection buffers a whole streaming session.
   * Mirrors the selection resolution the speech output factory uses.
   */
  function isActiveSpeechBuffered(): boolean {
    const characterId = sessions.sessionMetas[sessions.activeSessionId]?.characterId
    if (!characterId)
      return false
    const selection = cards.getModules(characterId)?.speech
    if (!selection || getDefinedProvider(selection.provider)?.capabilities?.speech?.transport !== 'bidirectional-ws')
      return false
    const model = resolveStreamingSessionModel(selection.model, providersStore.getDefaultModelForProvider(selection.provider))
    if (!model)
      return false
    return isBufferedStreamingResourceId(model.split('/', 2)[1] ?? '')
  }

  /**
   * Routes one batch of splitter events to the marker parser and caption
   * bus. A pair's flush marker is fed to the parser in its wire position,
   * right after the spoken sentence: the parser is the single serialized
   * channel into speech, and a direct flush could overtake the sentence
   * the parser still buffers, dropping the pair boundary.
   */
  function routeBilingualEvents(state: StreamingReactionState, events: Iterable<BilingualTurnEvent>) {
    for (const event of events) {
      if (event.kind === 'spoken') {
        if (event.text)
          void state.parser.consume(event.text)
      }
      else if (!state.captionsUnsupported) {
        // The flush marker cuts REST segmentation one clip per pair. A
        // buffered WebSocket session cannot align captions anyway, so it
        // gets neither the marker nor the translation event.
        void state.parser.consume(TTS_FLUSH_INSTRUCTION)
        bilingualCaptionBus.ingestTranslation(state.turnId, {
          language: state.translationLanguage ?? '',
          pairId: event.pairId,
          text: event.text,
        })
      }
    }
  }

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

      // Read bilingual settings once per reaction. Mid-reaction settings
      // changes cannot leak brackets into TTS or pair the wrong translation.
      const snapshot = bilingualSettings.snapshot()
      const turnId = `spark:${sparkEventId}`
      const speech = new Speech({ sessionId: sessions.activeSessionId, turnId }, 'notification')

      let splitter: BilingualTurnSplitter | undefined
      let captionsUnsupported = false
      if (snapshot) {
        splitter = createBilingualTurnSplitter()
        if (activeBilingualTurnId)
          bilingualCaptionBus.resetTurn(activeBilingualTurnId)
        activeBilingualTurnId = turnId
        captionsUnsupported = isActiveSpeechBuffered()
        // The output factory reads this flag when it opens the REST chunker.
        enableFlushBoundaryTurn(turnId)
        if (captionsUnsupported)
          markBufferedSpeechTurn(turnId)
      }

      const parser = parserFactory({
        onLiteral: async (literal) => {
          if (!literal)
            return
          // Bilingual flush markers reach the parser merged with adjacent
          // spoken bytes. Split them out into ordered commands: the byte
          // must cut the REST segment but never travel to a WebSocket as
          // text. Non-bilingual text contains no marker, so the common path
          // is one write of the whole literal.
          const segments = literal.split(TTS_FLUSH_INSTRUCTION)
          for (const [index, segment] of segments.entries()) {
            if (segment)
              await speech.write(segment)
            if (index < segments.length - 1)
              await speech.flush()
          }
        },
        onSpecial: async (special) => {
          if (special)
            await speech.special(special)
        },
      })

      streamingReactions.value.set(sparkEventId, {
        reaction: newReaction,
        speech,
        parser,
        splitter,
        turnId,
        captionsUnsupported,
        translationLanguage: snapshot?.translationLanguage,
      })
    }

    const state = streamingReactions.value.get(sparkEventId)!
    state.reaction.message += chunk
    if (state.splitter)
      routeBilingualEvents(state, state.splitter.consume(chunk))
    else
      void state.parser.consume(chunk)
  }

  function onSparkNotifyReactionStreamEnd(sparkEventId: string, fullText: string, options?: { metadata?: Record<string, unknown> }) {
    const state = streamingReactions.value.get(sparkEventId)
    if (!state)
      return

    if (state.splitter)
      routeBilingualEvents(state, state.splitter.end())

    // Only bilingual text carries UST brackets to strip. In an ordinary
    // response brackets are ordinary content (for example `arr[index]`) and
    // the raw plugin text persists unchanged.
    const message = state.splitter ? projectSpokenText(fullText) : fullText
    state.reaction.message = message
    recordSparkNotifyReaction(sparkEventId, message, { metadata: options?.metadata })

    // Close the parser first so every queued fragment, including the last
    // flush marker, reaches speech before EOF. finish resolves after owned
    // playback drained; only then publish translations playback never
    // reached and release the turn flags.
    void state.parser.end().then(async () => {
      await state.speech.end()
      streamingReactions.value.delete(sparkEventId)
      await state.speech.finish()
    }).catch(error => console.error('Notification speech failed', error)).finally(() => {
      // Publish pairs playback never reached, including after a speech
      // failure, and never leak the per-turn flags.
      bilingualCaptionBus.flushTurn(state.turnId)
      clearSpeechTurnFlags(state.turnId)
      if (activeBilingualTurnId === state.turnId)
        activeBilingualTurnId = undefined
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
