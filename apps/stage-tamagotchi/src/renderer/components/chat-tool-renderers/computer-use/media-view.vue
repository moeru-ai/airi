<script setup lang="ts">
import type { ComputerUseViewOf } from './view'

import ComputerUseMediaState from './media-state.vue'

import { LINE, LINE_ICON } from './classes'
import { useComputerUseLabels } from './use-labels'

/** Now playing as a small player, or a media command with the state before and after it. */
const props = defineProps<{
  view: ComputerUseViewOf<'now-playing' | 'media'>
}>()

const { t, KEY, label } = useComputerUseLabels()
</script>

<template>
  <ComputerUseMediaState v-if="props.view.kind === 'now-playing'" :state="props.view.state" />

  <template v-else>
    <span :class="LINE">
      <span :class="['i-mingcute:music-2-fill', LINE_ICON]" aria-hidden="true" />
      {{ label('media.commands', props.view.command) }}
      <span :class="['inline-flex items-center gap-0.5 text-xs', props.view.verified ? 'text-emerald-600 dark:text-emerald-400' : 'text-neutral-500']">
        <span v-if="props.view.verified" :class="['i-mingcute:check-line']" aria-hidden="true" />
        {{ props.view.verified ? t(`${KEY}.media.verified`) : t(`${KEY}.media.not-verified`) }}
      </span>
    </span>
    <div :class="['grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2']">
      <div :class="['rounded-lg px-2 py-1.5', 'bg-white dark:bg-neutral-900/60']">
        <ComputerUseMediaState :state="props.view.before" compact />
      </div>
      <span :class="['i-mingcute:arrow-right-line', 'text-neutral-400']" aria-hidden="true" />
      <div :class="['rounded-lg px-2 py-1.5', 'bg-white dark:bg-neutral-900/60']">
        <ComputerUseMediaState :state="props.view.after" compact />
      </div>
    </div>
  </template>
</template>
