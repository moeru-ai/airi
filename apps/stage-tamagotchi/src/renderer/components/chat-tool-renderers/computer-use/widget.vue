<script setup lang="ts">
import type { Component } from 'vue'

import type { ComputerUseView } from './view'

import AppView from './app-view.vue'
import CaptureView from './capture-view.vue'
import HelpView from './help-view.vue'
import InputView from './input-view.vue'
import MediaView from './media-view.vue'
import ScreenTextView from './screen-text-view.vue'

import { useComputerUseLabels } from './use-labels'

/**
 * One AUV command: its name and status, and the view of its command family.
 * A failed command shows why it failed. A command without a view shows only the header.
 */
const props = defineProps<{
  command: string
  /** A help call has no run, so it has no status. */
  status?: string
  failure?: { message: string, code?: string, detail?: string }
  view?: ComputerUseView
}>()

const { t, KEY, label } = useComputerUseLabels()

/** The view component of each kind. Each command family has one component for all its kinds. */
const FAMILY_VIEWS: Record<ComputerUseView['kind'], Component> = {
  'capture': CaptureView,
  'displays': CaptureView,
  'windows': CaptureView,
  'matches': ScreenTextView,
  'click-text': ScreenTextView,
  'text': InputView,
  'keys': InputView,
  'keyboard': InputView,
  'focus': InputView,
  'move': InputView,
  'click': InputView,
  'drag': InputView,
  'activate': AppView,
  'permissions': AppView,
  'now-playing': MediaView,
  'media': MediaView,
  'help': HelpView,
}
</script>

<template>
  <div :class="['flex flex-col gap-2 rounded-xl p-2.5', 'bg-white/75 dark:bg-neutral-800/60']">
    <div :class="['flex items-center justify-between gap-2']">
      <span :class="['min-w-0 inline-flex items-center gap-1.5 text-xs font-semibold', 'text-neutral-800 dark:text-neutral-100']">
        <span :class="['i-mingcute:terminal-box-line', 'shrink-0']" aria-hidden="true" />
        <code :class="['truncate']">{{ props.command }}</code>
      </span>
      <span v-if="props.view?.kind === 'help'" :class="['shrink-0 inline-flex items-center gap-1 text-[11px]', 'text-neutral-500 dark:text-neutral-400']">
        <span :class="['i-mingcute:question-line']" aria-hidden="true" />
        {{ t(`${KEY}.help`) }}
      </span>
      <span v-else-if="props.status" :class="['shrink-0 inline-flex items-center gap-1 text-[11px]', 'text-neutral-500 dark:text-neutral-400']">
        <span
          :class="[
            'size-1.5 rounded-full',
            props.status === 'completed' ? 'bg-emerald-500' : props.status === 'failed' ? 'bg-red-500' : 'bg-neutral-400',
          ]"
          aria-hidden="true"
        />
        {{ label('status', props.status) }}
      </span>
    </div>

    <div
      v-if="props.failure"
      :class="['flex flex-col gap-1 rounded-[10px] px-2.5 py-2 text-xs', 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300']"
    >
      <span :class="['break-words']">{{ props.failure.message }}</span>
      <!-- The detail often repeats the failure. It shows only when it says more. -->
      <span v-if="props.failure.detail && props.failure.detail !== props.failure.message" :class="['break-words opacity-80']">{{ props.failure.detail }}</span>
      <code v-if="props.failure.code" :class="['text-[10px] opacity-70']">{{ props.failure.code }}</code>
    </div>

    <component :is="FAMILY_VIEWS[props.view.kind]" v-if="props.view" :view="props.view" />
  </div>
</template>
