<script setup lang="ts">
import type { PrimitiveProps } from 'reka-ui'

import type { RegisteredItem, SwipeActionsSelectEvent } from './context'

import { Primitive, useForwardExpose } from 'reka-ui'
import { computed, onBeforeUnmount, onMounted, toRef } from 'vue'

import { injectSwipeActionsContext, injectSwipeActionsListContext } from './context'

const props = withDefaults(defineProps<PrimitiveProps & {
  /** Unique, stable action identity within its List. */
  value: string
  /** Prevents selection by pressing or full swipe. @default false */
  disabled?: boolean
}>(), { as: 'button', disabled: false })
const emit = defineEmits<{
  /** Prevent default to cancel selection before the Root emits its action. */
  select: [event: SwipeActionsSelectEvent]
}>()
const context = injectSwipeActionsContext()
const { forwardRef, currentElement } = useForwardExpose()
const disabled = computed(() => props.disabled || context.disabled.value)
const list = injectSwipeActionsListContext()
const edge = computed<'left' | 'right'>(() => (list.side.value === 'end') === (context.direction.value === 'ltr') ? 'right' : 'left')
const item: RegisteredItem = {
  list,
  element: currentElement,
  value: toRef(props, 'value'),
  disabled: toRef(props, 'disabled'),
  select: event => emit('select', event),
}
let unregister: (() => void) | undefined
onMounted(() => unregister = context.register(item))
onBeforeUnmount(() => unregister?.())
const exposed = computed(() => context.itemExposed(item))
const takeover = computed(() => context.itemTakeover(item))

/** Triggering workflow: pointer or native keyboard click -> Root selection. */
function press(event: MouseEvent) {
  if (disabled.value || !exposed.value) {
    event.preventDefault()
    return
  }
  context.activate(item)
}

/** Custom elements need the same keyboard activation that native buttons supply. */
function keydown(event: KeyboardEvent) {
  const element = currentElement.value
  if (element.tagName === 'BUTTON' || (element.tagName === 'A' && element.hasAttribute('href')))
    return
  if (event.key !== 'Enter' && event.key !== ' ')
    return
  event.preventDefault()
  if (!disabled.value && exposed.value && !event.repeat)
    context.activate(item)
}
</script>

<template>
  <Primitive
    :ref="forwardRef" :as="as" :as-child="asChild"
    :type="as === 'button' ? 'button' : undefined"
    :role="as === 'button' && !asChild ? undefined : 'button'"
    :disabled="disabled" :aria-disabled="disabled || undefined" :tabindex="disabled || !exposed ? -1 : 0"
    :inert="!exposed" :aria-hidden="!exposed"
    data-swipe-actions-item :data-value="value"
    :data-disabled="disabled ? '' : undefined"
    :data-state="takeover > 0 ? 'expanded' : 'idle'"
    :style="context.actionStyle(item)"
    @click="press" @keydown="keydown"
  >
    <slot :takeover="takeover" :disabled="disabled" :side="list.side.value" :edge="edge" />
  </Primitive>
</template>

<style scoped>
[data-swipe-actions-item] {
  /* Each cell consumes its own interval of the List's queried inline size.
     atan2 followed by tan converts a length ratio to a unitless progress. */
  --swipe-item-available: clamp(0px, calc(100cqi - var(--swipe-item-offset)), var(--swipe-item-cell));
  --swipe-item-room: max(0px, calc(var(--swipe-item-available) - var(--swipe-item-gap)));
  --swipe-item-progress: clamp(0, calc(tan(atan2(var(--swipe-item-available), var(--swipe-item-cell)))), 1);
  --swipe-item-inverse: calc(1 - var(--swipe-item-progress));
  /* Cubic scale and quadratic opacity reverse on the same spatial curve.
     Reserve the cell gap before scaling so entering actions cannot touch Content. */
  --swipe-item-scale: min(
    calc(1 - var(--swipe-item-inverse) * var(--swipe-item-inverse) * var(--swipe-item-inverse)),
    calc(tan(atan2(var(--swipe-item-room), var(--swipe-item-base-width))))
  );

  transform: scale(var(--swipe-item-scale));
  transform-origin: center;
  opacity: calc(1 - var(--swipe-item-inverse) * var(--swipe-item-inverse));
}
</style>
