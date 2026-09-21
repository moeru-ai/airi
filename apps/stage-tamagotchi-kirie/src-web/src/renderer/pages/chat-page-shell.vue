<script setup lang="ts">
import { useAdaptiveInput } from '@proj-airi/stage-layouts/composables/use-adaptive-input'
import { computed, useTemplateRef } from 'vue'

const props = withDefaults(defineProps<{
  /** Fits the complete chat page above the mobile keyboard. Defaults to false for desktop windows. */
  adaptiveInput?: boolean
}>(), {
  adaptiveInput: false,
})

const shell = useTemplateRef<HTMLElement>('shell')
const { viewportBottom } = useAdaptiveInput({
  area: shell,
  viewport: shell,
  enabled: () => props.adaptiveInput,
  overlayVirtualKeyboard: false,
})

// Include the title-bar reservation: viewportBottom is measured from the top of the WebView.
const shellStyle = computed(() => ({
  height: props.adaptiveInput ? `${viewportBottom.value}px` : undefined,
  overflow: 'hidden',
}))
</script>

<template>
  <div
    ref="shell"
    data-testid="desktop-chat-page-shell"
    :class="[
      'h-full w-full overflow-hidden pt-11',
    ]"
    :style="shellStyle"
  >
    <slot />
  </div>
</template>
