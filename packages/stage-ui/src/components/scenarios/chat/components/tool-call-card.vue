<script setup lang="ts">
import type { OpenUIError } from '@openuidev/lang-core'

import { Renderer } from '@openuidev/vue-lang'
import { computed } from 'vue'

import { toolCardLibrary } from './tool-card-library'

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

function reportErrors(errors: OpenUIError[]) {
  if (errors.length > 0)
    emit('broken')
}
</script>

<template>
  <Renderer
    :response="props.program"
    :library="toolCardLibrary"
    :tool-provider="toolProvider"
    :on-error="reportErrors"
  />
</template>
