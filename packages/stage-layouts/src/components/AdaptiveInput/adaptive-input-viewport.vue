<script lang="ts">
import type { PrimitiveProps } from 'reka-ui'

import { Primitive, useForwardExpose } from 'reka-ui'
import { onScopeDispose, watch } from 'vue'

import { injectAdaptiveInputRootContext } from './adaptive-input-context'

/** The polymorphic element used as the adaptive viewport. */
export interface AdaptiveInputViewportProps {
  /**
   * Element or component rendered as the viewport.
   *
   * @default 'div'
   */
  as?: PrimitiveProps['as']
  /**
   * Merges viewport behavior into the only child element.
   *
   * @default false
   */
  asChild?: boolean
}
</script>

<script setup lang="ts">
const props = withDefaults(defineProps<AdaptiveInputViewportProps>(), {
  as: 'div',
  asChild: false,
})
const context = injectAdaptiveInputRootContext()
const { currentElement, forwardRef } = useForwardExpose()

watch(currentElement, (element) => {
  context.setViewport(element && element instanceof HTMLElement ? element : null)
}, { flush: 'post', immediate: true })

onScopeDispose(() => {
  if (context.viewport.value === currentElement.value)
    context.setViewport(null)
})
</script>

<template>
  <Primitive
    :ref="forwardRef"
    :as="props.as"
    :as-child="props.asChild"
    :data-keyboard-visible="context.keyboardVisible.value ? '' : undefined"
    :style="context.enabled.value ? { height: `${context.viewportBottom.value}px` } : undefined"
  >
    <slot />
  </Primitive>
</template>
