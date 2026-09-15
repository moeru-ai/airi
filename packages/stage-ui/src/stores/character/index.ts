import type { BilingualTurnEvent, BilingualTurnSplitter } from '@proj-airi/pipelines-audio'

import type { StageTtsSession } from '../../libs/speech/tts-session'

import { createBilingualTurnSplitter, TTS_FLUSH_INSTRUCTION } from '@proj-airi/pipelines-audio'
import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import { useLlmmarkerParser } from '../../composables/llm-marker-parser'
import { useBilingualCaptionBus } from '../../services/bilingual-captions'
import { openStageSpeechSession } from '../../services/stage-speech-session-host'
import { useAiriCardStore } from '../modules'
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
  session: StageTtsSession
  /** Marker parser is the serialized input channel of the session. */
  parser: ReturnType<typeof useLlmmarkerParser>
  /** Undefined when bilingual mode is off; raw text then goes straight in. */
  splitter: BilingualTurnSplitter | undefined
  /** Caption bus turn id, same value as the speech session turnId. */
  turnId: string
  translationLanguage: string | undefined
}

const MAX_REACTIONS = 200

/** Returns the spoken projection of raw UST text, dropping bracket translations. */
function spokenProjection(rawText: string): string {
  const splitter = createBilingualTurnSplitter()
  let spoken = ''
  for (const event of [...splitter.consume(rawText), ...splitter.end()]) {
    if (event.kind === 'spoken')
      spoken += event.text
  }
  return spoken
}

export const useCharacterStore = defineStore('character', () => {
  const { activeCard, systemPrompt } = storeToRefs(useAiriCardStore())
  const bilingualSettings = useSettingsBilingualSubtitles()
  const bilingualCaptionBus = useBilingualCaptionBus()
  // A new reaction interrupts the previous one, so at most one bilingual
  // turn is active. Clear its caption line when the next one starts.
  let activeBilingualTurnId: string | undefined

  const name = computed(() => activeCard.value?.name ?? '')
  const ownerId = computed(() => activeCard.value?.name ?? 'default')

  const reactions = ref<CharacterSparkNotifyReaction[]>([])
  const streamingReactions = ref<Map<string, StreamingReactionState>>(new Map())

  /**
   * Routes one batch of splitter events to the marker parser and caption
   * bus. A pair's flush marker is written as parser text in its wire
   * position, right after the spoken sentence: the parser is the single
   * serialized channel into the session, and a direct write could overtake
   * the asynchronously delivered sentence and get dropped by the
   * flush-mode chunker, killing the pair's playback boundary.
   */
  function routeBilingualEvents(state: StreamingReactionState, events: Iterable<BilingualTurnEvent>) {
    for (const event of events) {
      if (event.kind === 'spoken') {
        bilingualCaptionBus.ingestSpoken(state.turnId)
        if (event.text)
          void state.parser.consume(event.text)
      }
      else {
        void state.parser.consume(TTS_FLUSH_INSTRUCTION)
        bilingualCaptionBus.ingestTranslation(state.turnId, {
          language: state.translationLanguage as string,
          pairId: event.pairId,
          text: event.text,
        })
      }
    }
  }

  function onSparkNotifyReactionStreamEvent(sparkEventId: string, chunk: string) {
    let state = streamingReactions.value.get(sparkEventId)
    if (!state) {
      // Read bilingual settings once per reaction. Mid-reaction settings
      // changes cannot leak brackets into TTS or pair the wrong translation.
      const snapshot = bilingualSettings.snapshot()
      const turnId = `spark:${sparkEventId}`
      if (snapshot) {
        if (activeBilingualTurnId)
          bilingualCaptionBus.resetTurn(activeBilingualTurnId)
        activeBilingualTurnId = turnId
      }

      // The orchestrator only delivers events to windows that mount Stage,
      // so this session always exists. The guard covers direct callers.
      const session = openStageSpeechSession({
        turnId,
        flushBoundaries: Boolean(snapshot),
        priority: 'high',
        behavior: 'interrupt',
        ownerId: ownerId.value,
      })
      if (!session)
        return

      const parser = useLlmmarkerParser({
        onLiteral: (literal) => {
          if (literal)
            session.appendText(literal)
        },
        onSpecial: (special) => {
          if (special)
            session.appendSpecial(special)
        },
      })

      state = {
        session,
        parser,
        splitter: snapshot ? createBilingualTurnSplitter() : undefined,
        turnId,
        translationLanguage: snapshot?.translationLanguage,
      }
      streamingReactions.value.set(sparkEventId, state)
    }

    if (state.splitter)
      routeBilingualEvents(state, state.splitter.consume(chunk))
    else
      void state.parser.consume(chunk)
  }

  function onSparkNotifyReactionStreamEnd(sparkEventId: string, fullText: string, options?: { metadata?: Record<string, unknown> }) {
    const state = streamingReactions.value.get(sparkEventId)
    if (!state) {
      // No speech session for this stream; persist the raw text.
      recordSparkNotifyReaction(sparkEventId, fullText, { metadata: options?.metadata })
      return
    }

    if (state.splitter)
      routeBilingualEvents(state, state.splitter.end())

    // Only bilingual text carries UST brackets to strip. In an ordinary
    // response brackets are ordinary content (e.g. `arr[index]`) and the
    // raw plugin text must be persisted unchanged.
    const message = state.splitter ? spokenProjection(fullText) : fullText
    recordSparkNotifyReaction(sparkEventId, message, { metadata: options?.metadata })

    // Close the parser first so every queued fragment (including the last
    // flush marker) reaches the session before EOF. Leftover pairs are
    // flushed by the terminal intent-drained / turn-end event, not here.
    void state.parser.end().then(() => {
      state.session.finishInput()
      state.session.end()
    })
    if (activeBilingualTurnId === state.turnId)
      activeBilingualTurnId = undefined
    streamingReactions.value.delete(sparkEventId)
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
  }
})
