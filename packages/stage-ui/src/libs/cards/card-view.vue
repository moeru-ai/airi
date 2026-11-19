<script setup lang="ts">
import type { FunctionalComponent } from 'vue'

import { computed, watch } from 'vue'

import { evaluateCard } from './program'

/**
 * Draws a card program. A tool card gets the result of one call as `data`, and a reply card holds its own values.
 * A program that does not draw with this data draws nothing and reports its problems.
 */
const props = defineProps<{
  program: string
  data?: unknown
}>()

const emit = defineEmits<{
  (e: 'broken', problems: string[]): void
}>()

const card = computed(() => evaluateCard(props.program, props.data))

watch(() => card.value.problems, (problems) => {
  if (problems.length > 0)
    emit('broken', problems)
}, { immediate: true })

const Drawn: FunctionalComponent = () => card.value.drawn ?? null
</script>

<template>
  <Drawn />
</template>
