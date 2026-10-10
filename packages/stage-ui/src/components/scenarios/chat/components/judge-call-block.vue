<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import RecipeDetails from './recipe-details.vue'

import { readJudgment } from '../../../../tools/judge-recipe'

const props = defineProps<{
  toolName: string
  args: string
  state?: 'executing' | 'done' | 'error'
  result?: unknown
}>()

const { t } = useI18n()

const judgment = computed(() => readJudgment(props.args, props.result))
// The details are the answer that the character chose, or what the call got wrong.
const details = computed(() => {
  const outcome = judgment.value.outcome
  if (!outcome)
    return ''
  return outcome.status === 'invalid' ? outcome.reason : outcome.answer
})
const tone = computed(() => {
  const outcome = judgment.value.outcome
  if (!outcome)
    return props.state === 'executing' ? 'executing' : 'blocked'
  return outcome.status === 'judged' ? 'used' : 'blocked'
})
</script>

<template>
  <RecipeDetails :label="t('stage.chat.judgment.label')" :name="judgment.name" :tone="tone" :details="details" />
</template>
