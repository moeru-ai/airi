<script setup lang="ts">
import type { IOSpan } from '@proj-airi/stage-shared'

import type { TurnStages } from '../../composables/turn-stages'

import { errorMessageFrom } from '@moeru/std'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useSpeechOutputControlStore } from '@proj-airi/stage-ui/stores/speech-output-control'
import { FieldCheckbox } from '@proj-airi/ui'
import { computed } from 'vue'

import { formatMs, metaNumber, metaText, spanMs } from '../../composables/turn-stages'

const props = defineProps<{
  stages?: TurnStages
  /** The chat whose character speaks the reply. */
  sessionId?: string
}>()

const sessions = useChatSessionStore()
const cards = useAiriCardStore()
const output = useSpeechOutputControlStore()

const muted = computed({
  get: () => output.speechMuted,
  set: value => output.setSpeechMuted(value),
})

/** The speech module of the character that owns the chat. */
const speech = computed(() => {
  const characterId = props.sessionId ? sessions.sessionMetas[props.sessionId]?.characterId : undefined
  if (!characterId)
    return undefined
  try {
    return { selection: cards.getModules(characterId).speech }
  }
  catch (cause) {
    return { error: errorMessageFrom(cause) ?? 'The speech module is unavailable.' }
  }
})

/** The result of a clip that played, or nothing before playback. */
function playbackStatus(played: IOSpan | undefined) {
  if (!played)
    return undefined
  if (played.error)
    return `playback failed: ${played.error}`
  if (played.meta.interrupted === true)
    return 'stopped early'
  return played.endTs === undefined ? 'playing' : 'played'
}

/**
 * One row for each synthesis request and one row for each clip that no request matches.
 * A streaming provider synthesizes the whole reply in one request without a segment id, so its clips get their own rows.
 */
const segments = computed(() => {
  const playback = props.stages?.playback ?? []
  const synthesis = props.stages?.synthesis ?? []
  const requested = synthesis.map((span) => {
    const played = span.ttsCorrelationId === undefined ? undefined : playback.find(clip => clip.ttsCorrelationId === span.ttsCorrelationId)
    let status = playbackStatus(played) ?? (span.ttsCorrelationId === undefined ? 'streamed' : 'synthesized')
    if (span.error)
      status = `failed: ${span.error}`
    else if (span.meta.no_audio === true)
      status = 'no audio'
    else if (span.meta.canceled === true)
      status = 'cancelled'
    return {
      id: span.id,
      text: metaText(span, 'text') ?? '',
      reason: metaText(span, 'chunk_reason'),
      synthesisMs: spanMs(span),
      audioMs: metaNumber(span, 'audio_duration_ms'),
      waitMs: played && span.endTs !== undefined ? played.startTs - span.endTs : undefined,
      status,
    }
  })
  const matched = new Set(synthesis.flatMap(span => span.ttsCorrelationId === undefined ? [] : [span.ttsCorrelationId]))
  const streamed = playback.filter(clip => clip.ttsCorrelationId === undefined || !matched.has(clip.ttsCorrelationId)).map(clip => ({
    id: clip.id,
    text: metaText(clip, 'text') ?? '',
    reason: undefined,
    synthesisMs: undefined,
    audioMs: spanMs(clip),
    waitMs: undefined,
    status: `streamed clip, ${playbackStatus(clip)}`,
  }))
  return [...requested, ...streamed]
})
</script>

<template>
  <div :class="['flex flex-col gap-3']">
    <FieldCheckbox v-model="muted" label="Mute speech" description="Muted replies stay text. This is the speech output setting of the app." />
    <div v-if="speech && 'selection' in speech && speech.selection" :class="['flex flex-wrap gap-x-4 gap-y-1 text-sm']">
      <span>Provider <span :class="['font-mono']">{{ speech.selection.provider || '—' }}</span></span>
      <span>Model <span :class="['font-mono']">{{ speech.selection.model || '—' }}</span></span>
      <span>Voice <span :class="['font-mono']">{{ speech.selection.voice_id || '—' }}</span></span>
      <span :class="['text-xs text-neutral-500 dark:text-neutral-400']">The character of the chat sets these in its card.</span>
    </div>
    <p v-else-if="speech && 'error' in speech" :class="['text-sm text-amber-600 dark:text-amber-400']">
      {{ speech.error }}
    </p>

    <table v-if="segments.length" :class="['w-full text-left text-sm']">
      <thead :class="['text-xs text-neutral-500 dark:text-neutral-400']">
        <tr>
          <th :class="['py-1 pr-3 font-normal']">
            Segment
          </th>
          <th :class="['py-1 pr-3 font-normal']" title="Why the chunker cut the text here">
            Cut
          </th>
          <th :class="['py-1 pr-3 font-normal']">
            Synthesis
          </th>
          <th :class="['py-1 pr-3 font-normal']">
            Audio
          </th>
          <th :class="['py-1 pr-3 font-normal']" title="From the end of synthesis to the start of playback">
            Queued
          </th>
          <th :class="['py-1 font-normal']">
            Result
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="segment in segments" :key="segment.id" :class="['border-t border-neutral-200 dark:border-neutral-700']">
          <td :class="['py-1 pr-3']">
            {{ segment.text }}
          </td>
          <td :class="['py-1 pr-3 font-mono text-xs']">
            {{ segment.reason ?? '—' }}
          </td>
          <td :class="['py-1 pr-3 font-mono']">
            {{ formatMs(segment.synthesisMs) }}
          </td>
          <td :class="['py-1 pr-3 font-mono']">
            {{ formatMs(segment.audioMs) }}
          </td>
          <td :class="['py-1 pr-3 font-mono']">
            {{ formatMs(segment.waitMs) }}
          </td>
          <td :class="['py-1']">
            {{ segment.status }}
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else :class="['text-sm text-neutral-500 dark:text-neutral-400']">
      No speech for the selected turn. The reply has not started, speech is muted, or the turn was a dry run.
    </p>
  </div>
</template>
