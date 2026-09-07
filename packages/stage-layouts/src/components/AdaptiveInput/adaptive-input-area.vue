<script lang="ts">
import type { PrimitiveProps } from 'reka-ui'

import { Primitive, useForwardExpose } from 'reka-ui'
import { onScopeDispose, watch } from 'vue'

import { injectAdaptiveInputRootContext } from './adaptive-input-context'

/** The polymorphic region that contains the editable control and related controls. */
export interface AdaptiveInputAreaProps {
  /**
   * Element or component rendered as the input area.
   *
   * @default 'div'
   */
  as?: PrimitiveProps['as']
  /**
   * Merges input-area behavior into the only child element.
   *
   * @default false
   */
  asChild?: boolean
}
</script>

<script setup lang="ts">
const props = withDefaults(defineProps<AdaptiveInputAreaProps>(), {
  as: 'div',
  asChild: false,
})
const context = injectAdaptiveInputRootContext()
const { currentElement, forwardRef } = useForwardExpose()

watch(currentElement, (element) => {
  context.setArea(element && element instanceof HTMLElement ? element : null)
}, { flush: 'post', immediate: true })

onScopeDispose(() => {
  if (context.area.value === currentElement.value)
    context.setArea(null)
})
</script>

<template>
  <Primitive
    :ref="forwardRef"
    :as="props.as"
    :as-child="props.asChild"
    :data-keyboard-visible="context.keyboardVisible.value ? '' : undefined"
  >
    <slot />
  </Primitive>
</template>
