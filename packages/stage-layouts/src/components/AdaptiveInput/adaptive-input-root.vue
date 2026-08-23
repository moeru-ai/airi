<script lang="ts">
import { computed, shallowRef } from 'vue'

import { useAdaptiveInput } from '../../composables/use-adaptive-input'
import { provideAdaptiveInputRootContext } from './adaptive-input-context'

/** The feature policy applied by AdaptiveInputRoot. */
export interface AdaptiveInputRootProps {
  /**
   * Enables keyboard measurement and layout updates.
   *
   * @default true
   */
  enabled?: boolean
}
</script>

<script setup lang="ts">
const props = withDefaults(defineProps<AdaptiveInputRootProps>(), {
  enabled: true,
})
defineSlots<{
  default: (props: {
    keyboardVisible: boolean
    visibleHeight: number
    viewportBottom: number
    viewportOffsetTop: number
  }) => unknown
}>()

const area = shallowRef<HTMLElement | null>(null)
const viewport = shallowRef<HTMLElement | null>(null)
const enabled = computed(() => props.enabled)
const {
  keyboardVisible,
  visibleHeight,
  viewportBottom,
  viewportOffsetTop,
} = useAdaptiveInput({
  area,
  enabled,
  viewport,
})

provideAdaptiveInputRootContext({
  area,
  enabled,
  keyboardVisible,
  setArea: element => area.value = element,
  setViewport: element => viewport.value = element,
  viewport,
  viewportBottom,
})
</script>

<template>
  <slot
    :keyboard-visible="keyboardVisible"
    :visible-height="visibleHeight"
    :viewport-bottom="viewportBottom"
    :viewport-offset-top="viewportOffsetTop"
  />
</template>
