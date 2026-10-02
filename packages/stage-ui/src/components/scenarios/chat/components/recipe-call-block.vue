<script setup lang="ts">
import { Collapsible } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import RecipePill from './recipe-pill.vue'

import { readRecipeUse } from '../../../../tools/use-recipe'

const props = defineProps<{
  toolName: string
  args: string
  state?: 'executing' | 'done' | 'error'
  result?: unknown
}>()

const { t } = useI18n()

const use = computed(() => readRecipeUse(props.args, props.result))
// The details are the task handed to the recipe, or why it did not start. The recipe's steps stay in its own space.
const details = computed(() => {
  const outcome = use.value.outcome
  if (outcome?.status === 'refused')
    return outcome.reason ?? ''
  return use.value.task
})
const tone = computed(() => {
  const outcome = use.value.outcome
  if (!outcome)
    return props.state === 'executing' ? 'executing' : 'blocked'
  return outcome.status === 'started' || outcome.status === 'switched' ? 'used' : 'blocked'
})
const label = computed(() => {
  const outcome = use.value.outcome
  if (!outcome)
    return t(props.state === 'executing' ? 'stage.chat.recipe.using' : 'stage.chat.recipe.failed')
  return t(`stage.chat.recipe.${outcome.status}`)
})
</script>

<template>
  <Collapsible :class="['flex flex-col items-start', 'gap-1.5']">
    <template #trigger="{ visible, setVisible }">
      <button
        type="button"
        :disabled="!details"
        :aria-expanded="details ? visible : undefined"
        :class="['max-w-full rounded-full', 'outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60', details ? 'cursor-pointer' : 'cursor-default']"
        @click="setVisible(!visible)"
      >
        <RecipePill :label="label" :name="use.name" :tone="tone">
          <span
            v-if="details"
            :class="['i-solar:alt-arrow-down-linear', 'shrink-0 text-sm', 'transition-transform duration-200', visible ? 'rotate-180' : '']"
            aria-hidden="true"
          />
        </RecipePill>
      </button>
    </template>
    <div
      v-if="details"
      :class="[
        'w-full rounded-lg p-2.5',
        'whitespace-pre-wrap break-words text-xs',
        'bg-neutral-100/80 text-neutral-700 dark:bg-neutral-900/80 dark:text-neutral-200',
      ]"
    >
      {{ details }}
    </div>
  </Collapsible>
</template>
