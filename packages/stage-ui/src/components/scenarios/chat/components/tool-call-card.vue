<script setup lang="ts">
import type { OpenUIError } from '@openuidev/lang-core'

import { Renderer } from '@openuidev/vue-lang'
import { computed, provide, ref, watch } from 'vue'

import { CARD_PROBLEM, NoQueryLoader, toolCardLibrary } from './tool-card-library'

/** The result of one tool call, drawn with the card that a model made for its tool. */
const props = defineProps<{
  /** The tool name that the program queries. */
  cardKey: string
  program: string
  /** The result of this call as data: an object, a list, or text. */
  data: unknown
}>()

const emit = defineEmits<{
  /** The program failed with this result, for example because the tool returns another shape now. */
  (e: 'broken'): void
}>()

// The program reads the result through `Query(cardKey)`. The answer is the result of this call, so the tool never runs again.
const toolProvider = computed(() => ({ [props.cardKey]: async () => props.data }))

// OpenUI keeps a Query result for its tool and arguments, so new data needs a new renderer, for example on the settings
// page when a later call of the tool replaces the preview data.
const dataVersion = ref(0)
watch(() => props.data, () => dataVersion.value++)

// A card reports one failure for each data version. The report waits for the render to end, because a part reports
// while it draws.
let reportedVersion = -1

function reportBroken() {
  if (reportedVersion === dataVersion.value)
    return
  reportedVersion = dataVersion.value
  queueMicrotask(() => emit('broken'))
}

provide(CARD_PROBLEM, reportBroken)

function reportErrors(errors: OpenUIError[]) {
  if (errors.length > 0)
    reportBroken()
}
</script>

<template>
  <Renderer
    :key="dataVersion"
    :response="props.program"
    :library="toolCardLibrary"
    :tool-provider="toolProvider"
    :query-loader="NoQueryLoader"
    :on-error="reportErrors"
  />
</template>
