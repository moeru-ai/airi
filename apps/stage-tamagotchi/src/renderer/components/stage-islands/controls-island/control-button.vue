<script setup lang="ts">
import type { ControlsIslandAction } from '@proj-airi/stage-ui/composables/use-analytics'

import { useAnalytics } from '@proj-airi/stage-ui/composables/use-analytics'

interface Props {
  buttonStyle?: string
  /** Records this controls-island action immediately before emitting the click. */
  trackAction?: ControlsIslandAction
}

const props = defineProps<Props>()
const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

const { trackControlsIslandAction } = useAnalytics()

function handleClick(event: MouseEvent) {
  if (props.trackAction) {
    trackControlsIslandAction({ action: props.trackAction })
  }

  emit('click', event)
}
</script>

<template>
  <button
    :class="[
      'border-2 border-solid border-neutral-200/60 dark:border-neutral-800/10',
      'bg-neutral-50/80 dark:bg-neutral-800/70',
      'w-fit flex items-center self-end justify-center p-2',
      'rounded-xl backdrop-blur-md',
      'transition-all hover:transition-none transition-duration-300 transition-ease-out',
      props.buttonStyle,
    ]"
    @click="handleClick"
  >
    <slot />
  </button>
</template>
