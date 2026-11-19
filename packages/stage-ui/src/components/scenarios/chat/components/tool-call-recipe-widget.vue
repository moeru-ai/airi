<script setup lang="ts">
import type { UseRecipeResult } from '../../../../tools/use-recipe'

import { useI18n } from 'vue-i18n'

import ToolCallScrollArea from './tool-call-scroll-area.vue'

/**
 * The outcome of a recipe call: the steps that the recipe gave, the task handed to a background recipe,
 * or why the recipe did not start, with the recipes that can start now.
 */
const props = defineProps<{
  outcome: UseRecipeResult
}>()

const { t } = useI18n()
const KEY = 'stage.chat.recipe-tool-call'
</script>

<template>
  <div :class="['flex flex-col gap-1.5 rounded-lg px-2.5 py-2 text-xs', 'bg-white/75 dark:bg-neutral-800/60']">
    <ToolCallScrollArea v-if="props.outcome.status === 'loaded'">
      <p :class="['m-0 whitespace-pre-wrap break-words']">
        {{ props.outcome.instructions }}
      </p>
    </ToolCallScrollArea>
    <dl v-else-if="props.outcome.status === 'started'" :class="['m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3']">
      <dt :class="['text-neutral-500 dark:text-neutral-400']">
        {{ t(`${KEY}.task`) }}
      </dt>
      <dd :class="['m-0 whitespace-pre-wrap break-words']">
        {{ props.outcome.task }}
      </dd>
    </dl>
    <template v-else>
      <p :class="['m-0 flex items-start gap-1.5']">
        <span :class="['i-mingcute:close-circle-line', 'mt-0.5 shrink-0 text-red-500 dark:text-red-400']" aria-hidden="true" />
        <!-- A refused recipe names its own reason. The other states mean the same thing every time. -->
        <span :class="['min-w-0 break-words']">{{ props.outcome.reason ?? t(`${KEY}.${props.outcome.status}`) }}</span>
      </p>
      <template v-if="props.outcome.usable.length">
        <span :class="['text-[11px]', 'text-neutral-500 dark:text-neutral-400']">{{ t(`${KEY}.usable`) }}</span>
        <ul :class="['m-0 flex flex-wrap gap-1 p-0']">
          <li
            v-for="name in props.outcome.usable"
            :key="name"
            :class="['list-none rounded-full px-2 py-px text-[11px]', 'bg-neutral-100 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300']"
          >
            {{ name }}
          </li>
        </ul>
      </template>
    </template>
  </div>
</template>
