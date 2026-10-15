<script setup lang="ts">
import type { IOTurn } from '@proj-airi/stage-shared'

import type { TurnStages } from '../../composables/turn-stages'

import { IOEvents } from '@proj-airi/stage-shared'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useVoiceStore, VOICE_TUNING_DEFAULTS } from '@proj-airi/stage-ui/stores/voice'
import { FieldCheckbox, FieldRange } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

import { bargeIns, endSilenceMs, formatMs, metaText, spanMs } from '../../composables/turn-stages'

const props = defineProps<{
  turn?: IOTurn
  stages?: TurnStages
  /** All recorded turns, to find the speech that stopped a reply and the replies that a speech stopped. */
  turns: readonly IOTurn[]
}>()

const voice = useVoiceStore()
const { endJudgeEnabled } = storeToRefs(useHearingStore())

const silenceLimitMs = computed(() => endJudgeEnabled.value ? voice.tuning.pauseMs + voice.tuning.graceMs : voice.tuning.pauseMs)

const silenceRule = computed(() => endJudgeEnabled.value
  ? `Silence ends an input after ${formatMs(silenceLimitMs.value)}, or after ${formatMs(voice.tuning.pauseMs)} when the judge reads a complete message.`
  : `Silence ends an input after ${formatMs(silenceLimitMs.value)}.`)

const input = computed(() => props.stages?.voiceInput)
const captureEndTs = computed(() => input.value?.events?.find(event => event.name === IOEvents.VoiceCaptureEnd)?.timeTs)
const silence = computed(() => props.stages ? endSilenceMs(props.stages, captureEndTs.value) : undefined)
const judgements = computed(() => (props.stages?.endJudgements ?? []).map(span => ({
  id: span.id,
  offsetMs: input.value ? span.startTs - input.value.startTs : undefined,
  verdict: metaText(span, 'judgement') ?? (span.meta.cancelled === true ? 'aborted' : span.endTs === undefined ? 'running' : 'failed'),
  ms: spanMs(span),
})))

/** Clips of this turn's reply that stopped early. */
const stoppedReplies = computed(() => props.turn ? bargeIns(props.turn, props.turns) : [])
/** Clips of earlier replies that this turn's speech stopped. */
const stoppedByThis = computed(() => props.turn ? props.turns.flatMap(other => other === props.turn ? [] : bargeIns(other, props.turns)).filter(item => item.by?.turn === props.turn) : [])

const interruptions = computed(() => [
  ...stoppedByThis.value.map(item => ({
    id: item.playback.id,
    text: `This speech stopped "${metaText(item.playback, 'text') ?? ''}" ${formatMs(item.stopMs)} after the input started, fade included.`,
  })),
  ...stoppedReplies.value.map(item => ({
    id: item.playback.id,
    text: [
      `"${metaText(item.playback, 'text') ?? ''}" stopped early`,
      item.reason ? `: ${item.reason}` : '',
      item.by ? `, ${formatMs(item.stopMs)} after the next input started` : '',
      '.',
    ].join(''),
  })),
])
</script>

<template>
  <div :class="['flex flex-col gap-3']">
    <div :class="['flex flex-col gap-4']">
      <FieldRange
        v-model="voice.tuning.pauseMs"
        as="div"
        label="Pause"
        description="A pause this long starts the end judge. Without the judge, it ends the input."
        :default-value="VOICE_TUNING_DEFAULTS.pauseMs"
        :min="300" :max="3000" :step="100"
        :format-value="value => `${value} ms`"
      />
      <FieldRange
        v-model="voice.tuning.graceMs"
        as="div"
        label="Grace"
        description="With the end judge, an unfinished message waits this much longer."
        :default-value="VOICE_TUNING_DEFAULTS.graceMs"
        :min="0" :max="6000" :step="250"
        :format-value="value => `${value} ms`"
      />
    </div>
    <FieldCheckbox
      v-model="endJudgeEnabled"
      label="End judge"
      description="A chat model reads the transcript at each pause. A complete message ends at the pause. This is the Hearing setting of the app."
    />
    <p :class="['text-xs text-neutral-500 dark:text-neutral-400']">
      {{ silenceRule }}
      The pause and the grace apply to this window only. No end-of-turn model is set. A later phase adds one beside the judge.
    </p>

    <p v-if="!stages || !input" :class="['text-sm text-neutral-500 dark:text-neutral-400']">
      Select a spoken turn.
    </p>
    <template v-else>
      <div :class="['flex flex-wrap gap-x-4 gap-y-1 text-sm']">
        <span>Started by <span :class="['font-mono']">{{ metaText(input, 'trigger') ?? '—' }}</span></span>
        <span>Outcome <span :class="['font-mono']">{{ metaText(input, 'outcome') ?? 'running' }}</span></span>
        <span v-if="metaText(input, 'reason')" :class="['text-neutral-500']">{{ metaText(input, 'reason') }}</span>
        <span>Silence before the end {{ formatMs(silence) }}</span>
      </div>
      <table v-if="judgements.length" :class="['w-full text-left text-sm']">
        <thead :class="['text-xs text-neutral-500 dark:text-neutral-400']">
          <tr>
            <th :class="['py-1 pr-3 font-normal']">
              Judged at
            </th>
            <th :class="['py-1 pr-3 font-normal']">
              Verdict
            </th>
            <th :class="['py-1 font-normal']">
              Took
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="judgement in judgements" :key="judgement.id" :class="['border-t border-neutral-200 dark:border-neutral-700']">
            <td :class="['py-1 pr-3 font-mono']">
              {{ judgement.offsetMs === undefined ? '—' : `+${formatMs(judgement.offsetMs)}` }}
            </td>
            <td :class="['py-1 pr-3 font-mono']">
              {{ judgement.verdict }}
            </td>
            <td :class="['py-1 font-mono']">
              {{ formatMs(judgement.ms) }}
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else :class="['text-sm text-neutral-500 dark:text-neutral-400']">
        No end judgement. The judge is off, the pause was too short, or the input ended by a control.
      </p>
    </template>

    <div v-if="stoppedByThis.length || stoppedReplies.length" :class="['flex flex-col gap-1 text-sm']">
      <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
        Interruptions
      </div>
      <div v-for="line in interruptions" :key="line.id">
        {{ line.text }}
      </div>
    </div>
  </div>
</template>
