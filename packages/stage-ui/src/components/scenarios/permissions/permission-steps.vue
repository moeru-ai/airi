<script setup lang="ts">
import { TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger } from 'reka-ui'

export interface PermissionStepItem {
  name: string
  /**
   * - `granted`: a primary fill.
   * - `skipped`: an outline without fill.
   * - `todo`: a light fill.
   */
  state: 'granted' | 'skipped' | 'todo'
  /** The state in words, for the tooltip. */
  stateLabel: string
}

defineProps<{
  steps: readonly PermissionStepItem[]
  /** The index of the shown step. */
  current: number
  label: string
}>()

const emit = defineEmits<{
  select: [index: number]
}>()
</script>

<template>
  <TooltipProvider :delay-duration="120">
    <div role="group" :aria-label="label" :class="['flex items-center gap-1.5']">
      <TooltipRoot v-for="(step, index) in steps" :key="step.name">
        <TooltipTrigger as-child>
          <button
            type="button"
            :aria-label="`${step.name}, ${step.stateLabel}`"
            :aria-current="index === current ? 'step' : undefined"
            :class="[
              'h-7 flex items-center rounded-full outline-none transition-[width] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]',
              'focus-visible:ring-2 focus-visible:ring-primary-400/60',
              index === current ? 'w-11' : 'w-5.5',
            ]"
            @click="emit('select', index)"
          >
            <span
              :class="[
                'block h-1.5 w-full rounded-full transition-colors duration-200',
                step.state === 'granted'
                  ? 'bg-primary-500'
                  : index === current
                    ? 'bg-neutral-800 dark:bg-neutral-100'
                    : step.state === 'skipped'
                      ? 'bg-transparent ring-1 ring-neutral-400 ring-inset dark:ring-neutral-500'
                      : 'bg-neutral-200 dark:bg-neutral-700',
              ]"
            />
          </button>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent
            side="bottom"
            align="start"
            :side-offset="4"
            :class="['z-[10000] flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs shadow-md', 'bg-neutral-900 text-neutral-100 dark:bg-neutral-100 dark:text-neutral-900', 'animate-slideUpAndFade']"
          >
            <span :class="['font-semibold']">{{ step.name }}</span>
            <span :class="['opacity-70']">{{ step.stateLabel }}</span>
          </TooltipContent>
        </TooltipPortal>
      </TooltipRoot>
    </div>
  </TooltipProvider>
</template>
