<script setup lang="ts">
import type { TurnStages } from '../../composables/turn-stages'
import type { InputRecord } from '../../composables/use-turn-recorder'

import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useVoiceStore } from '@proj-airi/stage-ui/stores/voice'
import { Button, FieldCheckbox } from '@proj-airi/ui'
import { computed } from 'vue'

import { formatMs, metaText, spanMs } from '../../composables/turn-stages'
import { useHearingDelivery } from '../../composables/use-hearing-delivery'

const props = defineProps<{
  stages?: TurnStages
  record?: InputRecord
  /** The end of speech of the selected turn, in milliseconds since the epoch. */
  speechEndTs?: number
  /** Why the rollouts cannot run on the selected turn, or nothing. */
  rolloutsBlocked?: string
  /** What the offline lab probe does with the turn audio now. */
  rolloutsStatus?: string
}>()

const emit = defineEmits<{
  /** Sends the audio of the selected turn to the offline lab and probes it there. */
  runRollouts: []
}>()

const hearing = useHearingStore()
const voice = useVoiceStore()

const recognition = computed(() => props.stages?.recognition.at(-1))
const sentHotwords = computed(() => {
  const value = recognition.value?.meta.hotwords
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
})
const { delivery } = useHearingDelivery(sentHotwords)
const takesHotwords = computed(() => delivery.value.status === 'sent')
const finalText = computed(() => props.record?.submission?.transcript.raw.text ?? metaText(recognition.value, 'text'))
</script>

<template>
  <div :class="['flex flex-col gap-3']">
    <div :class="['flex flex-wrap items-baseline gap-2 text-sm']">
      <span :class="['text-neutral-500 dark:text-neutral-400']">Hearing now</span>
      <span :class="['font-mono']">{{ hearing.activeTranscriptionProvider || '(no provider)' }}</span>
      <span v-if="hearing.activeTranscriptionModel" :class="['font-mono text-neutral-500']">{{ hearing.activeTranscriptionModel }}</span>
      <span :class="['text-xs text-neutral-500 dark:text-neutral-400']">Change it in the Hearing settings.</span>
    </div>
    <FieldCheckbox
      v-model="voice.tuning.sendHotwords"
      label="Send the conversation terms as hotwords"
      :description="takesHotwords
        ? 'Off sends no hotwords, so you can compare the same speech with and without them. It applies to this window only.'
        : delivery.note"
    />

    <p v-if="!stages" :class="['text-sm text-neutral-500 dark:text-neutral-400']">
      Select a spoken turn.
    </p>
    <template v-else>
      <div v-if="recognition" :class="['flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400']">
        <span>Provider <span :class="['font-mono']">{{ metaText(recognition, 'name') ?? '—' }}</span></span>
        <span>Model <span :class="['font-mono']">{{ metaText(recognition, 'model') ?? '—' }}</span></span>
        <span>Request {{ formatMs(spanMs(recognition)) }}</span>
        <span v-if="recognition.error" :class="['text-red-600 dark:text-red-400']">Failed: {{ recognition.error }}</span>
        <span v-else-if="speechEndTs !== undefined && recognition.endTs !== undefined">Final {{ formatMs(recognition.endTs - speechEndTs) }} after the speech end</span>
        <span v-if="recognition.meta.abort === true" :class="['text-amber-600 dark:text-amber-400']">Aborted</span>
      </div>
      <div :class="['flex flex-col gap-1']">
        <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
          Hotwords sent
        </div>
        <div v-if="sentHotwords.length" :class="['flex flex-wrap gap-1']">
          <span
            v-for="phrase in sentHotwords"
            :key="phrase"
            :class="['rounded bg-neutral-100 px-2 py-0.5 font-mono text-xs dark:bg-neutral-800']"
          >{{ phrase }}</span>
        </div>
        <span v-else :class="['text-sm text-neutral-500 dark:text-neutral-400']">None. The provider takes none, the switch is off, or the chat has no terms yet.</span>
      </div>

      <div :class="['flex flex-col gap-1']">
        <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
          Revisions
        </div>
        <div v-if="record?.partials.length" :class="['flex max-h-48 flex-col gap-0.5 overflow-auto text-sm']">
          <div v-for="(partial, index) in record.partials" :key="index" :class="['flex gap-3']">
            <span :class="['shrink-0 font-mono text-xs text-neutral-500']">+{{ formatMs(partial.ts - record.startTs) }}</span>
            <span>{{ partial.text || '(empty)' }}</span>
            <span v-if="partial.final" :class="['shrink-0 text-xs text-neutral-500']">final</span>
          </div>
        </div>
        <span v-else :class="['text-sm text-neutral-500 dark:text-neutral-400']">No revisions. Only inputs of this page's voice host are recorded.</span>
      </div>
      <p :class="['rounded-lg bg-neutral-100 p-3 text-sm dark:bg-neutral-800']">
        <span :class="['text-xs text-neutral-500']">{{ recognition?.error ? 'Failed · ' : 'Final · ' }}</span>{{ finalText || '(no words)' }}
      </p>

      <div :class="['flex flex-wrap items-center gap-3']">
        <Button size="sm" icon="i-solar:play-bold" label="Run rollouts on this turn" :disabled="!!rolloutsBlocked" @click="emit('runRollouts')" />
        <span v-if="rolloutsBlocked" :class="['text-xs text-neutral-500 dark:text-neutral-400']">{{ rolloutsBlocked }}</span>
        <span v-else-if="rolloutsStatus" :class="['text-xs text-neutral-500 dark:text-neutral-400']">{{ rolloutsStatus }}</span>
      </div>
      <p :class="['text-xs text-neutral-500 dark:text-neutral-400']">
        Rollouts run after the turn, on the Sherpaw model of the offline lab. The results show in the lab sections below. They never reach the chat.
      </p>
    </template>
  </div>
</template>
