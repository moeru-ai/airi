<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import RecipeDetails from './recipe-details.vue'

import { readRecipeUse } from '../../../../tools/use-recipe'

const props = defineProps<{
  toolName: string
  args: string
  state?: 'executing' | 'done' | 'error'
  result?: unknown
}>()

const { t } = useI18n()

const use = computed(() => readRecipeUse(props.args, props.result))
// The details are the steps the recipe gave, the task handed to a background recipe, or why it did not start.
const details = computed(() => {
  const outcome = use.value.outcome
  if (outcome?.status === 'refused')
    return outcome.reason ?? ''
  if (outcome?.status === 'loaded')
    return outcome.instructions
  return use.value.task
})
const tone = computed(() => {
  const outcome = use.value.outcome
  if (!outcome)
    return props.state === 'executing' ? 'executing' : 'blocked'
  return outcome.status === 'started' || outcome.status === 'loaded' ? 'used' : 'blocked'
})
const label = computed(() => {
  const outcome = use.value.outcome
  if (!outcome)
    return t(props.state === 'executing' ? 'stage.chat.recipe.using' : 'stage.chat.recipe.failed')
  return t(`stage.chat.recipe.${outcome.status}`)
})
</script>

<template>
  <RecipeDetails :label="label" :name="use.name" :tone="tone" :details="details" />
</template>
