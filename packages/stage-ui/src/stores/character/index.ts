import type { BilingualTurnSplitter } from '@proj-airi/pipelines-audio'

import type { ReactionSpeechSurface } from '../../services/reaction-speech'

import { createBilingualTurnSplitter } from '@proj-airi/pipelines-audio'
import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import { useBilingualCaptionBus } from '../../services/bilingual-captions'
import { openReactionSpeech, spokenProjection } from '../../services/reaction-speech'
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
  /** Caption bus turn id, same value as the speech session turnId. */
  turnId: string
  /** Resolves to the local or cross-window speech surface. */
  surface: Promise<ReactionSpeechSurface>
  /**
   * Serializes raw chunk delivery until the surface is ready and keeps
   * chunks in arrival order.
   */
  chain: Promise<void>
  /** Spoken-only projection splitter for the persisted message. */
  projection: BilingualTurnSplitter | undefined
  /** Accumulated spoken projection of the whole reaction. */
  spokenText: string
  /** Stream end was requested; late chunks must not reopen delivery. */
  ended: boolean
}

const MAX_REACTIONS = 200

export const useCharacterStore = defineStore('character', () => {
  const { activeCard, systemPrompt } = storeToRefs(useAiriCardStore())
  const bilingualSettings = useSettingsBilingualSubtitles()
  const bilingualCaptionBus = useBilingualCaptionBus()
  // Spark reactions interrupt earlier speech. Track active turn ids so the
  // previous reaction's caption line is cleared when a new one starts. The
  // playback host keeps an equivalent set for turns it speaks remotely.
  const activeSparkTurnIds = new Set<string>()

  const name = computed(() => activeCard.value?.name ?? '')
  const ownerId = computed(() => activeCard.value?.name ?? 'default')

  const reactions = ref<CharacterSparkNotifyReaction[]>([])
  const streamingReactions = ref<Map<string, StreamingReactionState>>(new Map())

  async function emitTextOutput(text: string) {
    // Plugin-emitted text can carry bilingual tags after a spark request
    // injected the format instruction. Give it a turn id so playback pairing
    // and the caption bus can handle it like a reaction.
    const snapshot = bilingualSettings.snapshot()
    const surface = await openReactionSpeech({
      turnId: `spark:direct:${nanoid()}`,
      ...(snapshot ? { translationLanguage: snapshot.translationLanguage } : {}),
      priority: 'normal',
      behavior: 'queue',
      ownerId: ownerId.value,
    })

    surface.append(text)
    // Leftover translations are flushed by the terminal intent-drained /
    // turn-end event once audio actually finishes — not here at text end.
    await surface.finish()
  }

  function onSparkNotifyReactionStreamEvent(sparkEventId: string, chunk: string) {
    let state = streamingReactions.value.get(sparkEventId)
    if (!state) {
      // Read bilingual settings once per reaction. Mid-reaction settings
      // changes cannot leak brackets into TTS or pair the wrong translation.
      const snapshot = bilingualSettings.snapshot()
      const turnId = `spark:${sparkEventId}`
      if (snapshot) {
        for (const previousTurnId of activeSparkTurnIds)
          bilingualCaptionBus.resetTurn(previousTurnId)
        activeSparkTurnIds.clear()
        activeSparkTurnIds.add(turnId)
      }

      const surfacePromise = openReactionSpeech({
        turnId,
        ...(snapshot ? { translationLanguage: snapshot.translationLanguage } : {}),
        priority: 'high',
        behavior: 'interrupt',
        ownerId: ownerId.value,
      })
      surfacePromise.catch((error) => {
        console.warn('[Character] Failed to open spark reaction speech', error)
      })

      state = {
        turnId,
        surface: surfacePromise,
        chain: Promise.resolve(),
        projection: snapshot ? createBilingualTurnSplitter() : undefined,
        spokenText: '',
        ended: false,
      }
      streamingReactions.value.set(sparkEventId, state)
    }

    // Bilingual mode persists the spoken projection; raw chunks still
    // carry UST brackets for the splitter at the speech surface. In
    // non-bilingual mode the plugin's final text is persisted at stream
    // end, so nothing is accumulated here.
    if (state.projection)
      state.spokenText += spokenProjection(state.projection.consume(chunk))

    if (state.ended)
      return

    state.chain = state.chain
      .then(async () => {
        const surface = await state.surface
        surface.append(chunk)
      })
      .catch((error) => {
        // A speech failure must not stop the visible reaction stream.
        console.warn('[Character] Spark reaction speech chunk failed', error)
      })
  }

  function onSparkNotifyReactionStreamEnd(sparkEventId: string, fullText: string, options?: { metadata?: Record<string, unknown> }) {
    const state = streamingReactions.value.get(sparkEventId)
    if (!state || state.ended)
      return

    // The splitter drain delivers a final closed translation to the speech
    // surface; an unclosed bracket stays in the spoken projection.
    const spokenTail = state.projection ? spokenProjection(state.projection.end()) : ''
    state.spokenText += spokenTail
    recordSparkNotifyReaction(
      sparkEventId,
      state.projection ? state.spokenText : fullText,
      { metadata: options?.metadata },
    )

    state.ended = true
    state.chain = state.chain
      .then(async () => {
        const surface = await state.surface
        // Pairs that playback never reaches are flushed by the terminal
        // intent-drained / turn-end event, not by a timer.
        await surface.finish()
      })
      .catch((error) => {
        console.warn('[Character] Spark reaction speech finish failed', error)
      })
      .then(() => {
        activeSparkTurnIds.delete(state.turnId)
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
