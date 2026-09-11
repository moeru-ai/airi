import type { IntentHandle } from '@proj-airi/pipelines-audio'

import type { SparkTranslationEvent } from '../../composables/use-spark-translation-channel'
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
  /**
   * Languages the split and the recorded text use. Captured together with the
   * split, so a settings change before the reaction ends cannot record text in
   * a language the speech engine was never given. Present only for a request
   * that asked for bilingual output, which is also the only kind that announced
   * a turn to release when the reaction ends.
   */
  bilingualSettings?: { languages: string[], ttsLanguage: string }
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
  const { post: postSparkEvent } = useSparkTranslationChannel()

  /**
   * Bilingual settings each reaction will be produced with, keyed by spark event
   * id. A request that was not asked for bilingual output leaves no entry.
   *
   * Recorded when the request is composed, because that is the moment the model
   * is asked to tag its output. Capturing at the first streamed delta instead
   * would miss a change made while the model is still thinking, and the reply
   * would then be read out with its tags intact.
   */
  const pendingSparkSettings = new Map<string, { languages: string[], ttsLanguage: string }>()

  /**
   * Turn ids whose voice decision has already been announced. The store is asked
   * to compose the request and the reaction then runs, so `prepareSparkNotifyReaction`
   * is called for the same event twice: announcing its turn twice would have the
   * window that plays it seed the voice and reserve the turn twice.
   */
  const announcedSparkTurns = new Set<string>()

  /** Speech turn a reaction plays as. */
  function sparkTurnId(sparkEventId: string) {
    return `${SPARK_TURN_ID_PREFIX}${sparkEventId}`
  }

  /** Broadcasts one event, tolerating a channel that is already closed. */
  function postSparkEventSafely(event: SparkTranslationEvent) {
    try {
      postSparkEvent(event)
    }
    catch {
      // BroadcastChannel may be closed - don't break the reaction
    }
  }

  /** Records the settings the reaction about to be requested will be split with. */
  function prepareSparkNotifyReaction(sparkEventId: string) {
    if (announcedSparkTurns.has(sparkEventId))
      return
    announcedSparkTurns.add(sparkEventId)

    // The voice decision is captured now, while the request is composed: a
    // reaction asked for without bilingual is monolingual, so its playback keeps
    // the configured voice even if the user switches bilingual on before it
    // speaks. Without this, `bilingualVoiceForTurn` re-resolves from the live
    // settings and would read an English reply in a Japanese voice.
    postSparkEventSafely({
      kind: 'turn',
      turnId: sparkTurnId(sparkEventId),
      ttsLanguage: bilingualStore.enabled ? bilingualStore.ttsLanguage : undefined,
    })

    if (!bilingualStore.enabled)
      return

    pendingSparkSettings.set(sparkEventId, {
      languages: bilingualStore.subtitleLanguages,
      ttsLanguage: bilingualStore.ttsLanguage,
    })
  }

  /**
   * Releases the turn a reaction plays as.
   *
   * The window that plays reactions reserves its state per turn, and a turn is
   * named nowhere else: one whose reaction ended without speaking would stay
   * reserved for the life of the session. A turn that did speak keeps its
   * reservation until playback moves on, which that window decides on its own.
   */
  function releaseSparkTurn(sparkEventId: string) {
    announcedSparkTurns.delete(sparkEventId)
    postSparkEventSafely({ kind: 'turn-end', turnId: sparkTurnId(sparkEventId) })
  }

  /**
   * Drops a reaction that will not be produced.
   *
   * Composing or running it failed, so nothing streams and nothing speaks for
   * it: what its request reserved goes, along with the turn it had announced. A
   * reaction that had already streamed left a speech intent open, and dropping
   * the state alone would leave the pipeline waiting for text that never comes —
   * while the next attempt reuses that intent id.
   */
  function abandonSparkNotifyReaction(sparkEventId: string) {
    const state = streamingReactions.value.get(sparkEventId)
    // A reaction that announced a turn is what has one to release, whether it
    // asked for bilingual output or not: its id stays in the announced set until
    // then, so a re-scheduled event with the same id would be dropped.
    const announcedBySettings = state?.bilingualSettings
      ?? pendingSparkSettings.get(sparkEventId)
    const turnAnnounced = announcedSparkTurns.has(sparkEventId)

    pendingSparkSettings.delete(sparkEventId)
    streamingReactions.value.delete(sparkEventId)

    if (state) {
      state.intent.cancel('spark-notify-failed')
      // Closing the split lets the markers it still holds settle, instead of
      // leaving their loop pending. Anything they deliver now is dropped: the
      // state above is gone, which is what the pair broadcast checks.
      void state.parser.end()
    }

    if (announcedBySettings || turnAnnounced)
      releaseSparkTurn(sparkEventId)
  }

  /** Settings the reaction is split and projected with. Taken once, by the split. */
  function takeSparkSettings(sparkEventId: string) {
    const settings = pendingSparkSettings.get(sparkEventId)
    pendingSparkSettings.delete(sparkEventId)
    return settings
  }

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
        turnId: sparkTurnId(sparkEventId),
        intentId: sparkTurnId(sparkEventId),
        ownerId: ownerId.value,
        priority: 'high',
        behavior: 'interrupt',
      })

      // Bilingual output labels every segment, so it has to be split before it
      // reaches the speech engine: the control tags would be read aloud and
      // shown in the caption line, and the translation has no chat bubble of
      // its own to render in.
      let bilingualTurn: BilingualTurn | undefined
      const bilingualSettings = takeSparkSettings(sparkEventId)
      if (bilingualSettings) {
        const turnId = sparkTurnId(sparkEventId)

        // The pairs are broadcast instead of captioned here: the model finishes
        // long before the audio does, and only the window hosting the speech
        // pipeline knows which sentence is being spoken right now.
        bilingualTurn = createBilingualTurn({
          languages: bilingualSettings.languages,
          ttsLanguage: bilingualSettings.ttsLanguage,
          onSpoken: (text) => {
            intent.writeLiteral(text)
            newReaction.message += text
          },
          onPair: (pair) => {
            // An abandoned reaction keeps no state, and a pair broadcast after
            // that would caption a turn the other window has already released.
            if (!streamingReactions.value.has(sparkEventId))
              return

            postSparkEventSafely({ kind: 'pair', turnId, ...pair })
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

      streamingReactions.value.set(sparkEventId, { reaction: newReaction, intent, parser, bilingualTurn, bilingualSettings })
    }

    const state = streamingReactions.value.get(sparkEventId)!
    // While bilingual is on the message is filled in by the split above, which
    // is the only place that knows which part of the output is spoken.
    if (!state.bilingualTurn)
      state.reaction.message += chunk
    void state.parser.consume(chunk)
  }

  function onSparkNotifyReactionStreamEnd(sparkEventId: string, fullText: string, options?: { metadata?: Record<string, unknown> }) {
    // Every reaction that was prepared announced its turn, so it has one to
    // release here — bilingual or not. A non-bilingual reaction that kept its
    // turn reserved would leak it, and its id would stay in the announced set so
    // a re-scheduled event with the same id would be treated as already prepared
    // and dropped before the model is even asked.
    const announced = announcedSparkTurns.has(sparkEventId)
    const prepared = pendingSparkSettings.has(sparkEventId)
    pendingSparkSettings.delete(sparkEventId)

    const state = streamingReactions.value.get(sparkEventId)
    if (!state) {
      if (announced || prepared)
        releaseSparkTurn(sparkEventId)
      return
    }

    // Reactions are handed back to the module that requested them, so the
    // stored text must not keep the `[EN]`/`[CN]` control tags. Recording stays
    // synchronous: the caller reads it back as soon as the agent turn resolves.
    // The languages come from the split, not from the settings as they are now:
    // the reaction was spoken in the former, so the stored text has to match.
    const text = state.bilingualSettings
      ? projectBilingualText(fullText, state.bilingualSettings.languages, state.bilingualSettings.ttsLanguage)
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

      // Released after the drain so the pairs above are already broadcast: the
      // window that plays the reaction keeps the turn of one that spoke, and
      // drops the one of a reaction that ended without anything to speak.
      if (announced)
        releaseSparkTurn(sparkEventId)
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
    prepareSparkNotifyReaction,
    onSparkNotifyReactionStreamEvent,
    onSparkNotifyReactionStreamEnd,
    abandonSparkNotifyReaction,
    clearReactions,

    emitTextOutput,
  }
})
