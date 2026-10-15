<script setup lang="ts">
import type { TurnStages } from '../../composables/turn-stages'
import type { InputRecord } from '../../composables/use-turn-recorder'

import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { usePhoneticVocabularyStore } from '@proj-airi/stage-ui/stores/phonetic-vocabulary'
import { FieldCheckbox } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

import { formatMs, metaNumber, metaText, spanMs } from '../../composables/turn-stages'
import { suggestionsOf } from '../../composables/use-turn-recorder'

const props = defineProps<{
  stages?: TurnStages
  record?: InputRecord
  /** The `speechContext` that the chat turn of the input sends. */
  speechContext?: string
}>()

const { rephraseEnabled, phoneticRerankEnabled } = storeToRefs(useHearingStore())
const vocabulary = usePhoneticVocabularyStore()

const submission = computed(() => props.record?.submission)
const suggestions = computed(() => suggestionsOf(submission.value))
const rephrase = computed(() => props.stages?.rephrase.at(-1))
/** The context as indented JSON. Text that is not JSON shows as it is. */
const prettyContext = computed(() => {
  if (!props.speechContext)
    return undefined
  try {
    return JSON.stringify(JSON.parse(props.speechContext), null, 2)
  }
  catch {
    return props.speechContext
  }
})
</script>

<template>
  <div :class="['flex flex-col gap-3']">
    <div :class="['flex flex-col gap-4']">
      <FieldCheckbox
        v-model="rephraseEnabled"
        label="Rephrase"
        description="A chat model cleans up the transcript before it is sent. This is the Hearing setting of the app."
      />
      <FieldCheckbox
        v-model="phoneticRerankEnabled"
        label="Rerank suggestions by the conversation"
        description="Multilingual E5 orders near ties on sound by meaning. It downloads about 120 MB once. This is the Hearing setting of the app."
      />
    </div>
    <p :class="['text-xs text-neutral-500 dark:text-neutral-400']">
      Suggestions match the whole transcript against {{ vocabulary.entries.length }} domain terms. Live turns read no uncertainty, so the uncertainty scope stays in the offline lab.
    </p>

    <p v-if="!submission" :class="['text-sm text-neutral-500 dark:text-neutral-400']">
      Select a spoken turn of this page's voice host. A cancelled input has nothing to show.
    </p>
    <template v-else>
      <div :class="['grid gap-2 text-sm md:grid-cols-2']">
        <div :class="['flex flex-col gap-1 rounded-lg bg-neutral-100 p-3 dark:bg-neutral-800']">
          <span :class="['text-xs text-neutral-500']">Recognized</span>
          <span>{{ submission.transcript.raw.text || '(no words)' }}</span>
        </div>
        <div :class="['flex flex-col gap-1 rounded-lg bg-neutral-100 p-3 dark:bg-neutral-800']">
          <span :class="['text-xs text-neutral-500']">Sent</span>
          <span>{{ submission.text || '(no words)' }}</span>
        </div>
      </div>
      <div v-if="rephrase" :class="['flex flex-wrap gap-x-4 text-xs text-neutral-500 dark:text-neutral-400']">
        <span v-if="rephrase.error" :class="['text-red-600 dark:text-red-400']">Rephrase failed: {{ rephrase.error }}</span>
        <span v-else-if="rephrase.meta.cancelled === true">Rephrase was cancelled</span>
        <span v-else>Rephrase changed {{ metaNumber(rephrase, 'changed_count') ?? '—' }} of {{ metaNumber(rephrase, 'segment_count') ?? '—' }} segments</span>
        <span :class="['font-mono']">{{ metaText(rephrase, 'model') ?? '' }}</span>
        <span>{{ formatMs(spanMs(rephrase)) }}</span>
      </div>

      <div :class="['flex flex-col gap-1']">
        <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
          Suggestions
        </div>
        <div v-for="item in suggestions" :key="`${item.span}:${item.candidate}`" :class="['flex flex-wrap items-baseline gap-2 text-sm']">
          <span>{{ item.span }}</span>
          <span :class="['i-solar:arrow-right-linear text-neutral-400']" />
          <span :class="['font-medium text-primary-600 dark:text-primary-400']">{{ item.candidate }}</span>
          <span :class="['text-xs text-neutral-500']">{{ item.term }} · {{ item.score.toFixed(2) }}</span>
        </div>
        <span v-if="!suggestions.length" :class="['text-sm text-neutral-500 dark:text-neutral-400']">None</span>
      </div>

      <div :class="['flex flex-col gap-1']">
        <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
          Speech context of the chat turn
        </div>
        <pre v-if="prettyContext" :class="['max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-neutral-100 p-3 text-xs dark:bg-neutral-800']">{{ prettyContext }}</pre>
        <span v-else :class="['text-sm text-neutral-500 dark:text-neutral-400']">None. No plugin published context, so the chat model reads the text only.</span>
      </div>
    </template>
  </div>
</template>
