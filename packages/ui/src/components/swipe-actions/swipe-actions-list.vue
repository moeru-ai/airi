<script setup lang="ts">
import type { PrimitiveProps } from 'reka-ui'

import type { RegisteredList, SwipeActionsSide } from './context'

import { useMutationObserver } from '@vueuse/core'
import { Primitive, useForwardExpose } from 'reka-ui'
import { computed, onBeforeUnmount, onMounted, toRef } from 'vue'

import { injectSwipeActionsContext, provideSwipeActionsListContext } from './context'

const props = withDefaults(defineProps<PrimitiveProps & {
  /** Logical edge that this List reveals. One List per edge in a Root. @default 'end' */
  side?: SwipeActionsSide
  /** Stable Item value for long swipe. Omit to use the last Item in this List's DOM order. */
  defaultAction?: string
  /** Settled width per Item in CSS pixels. @default 88 */
  actionWidth?: number
  /** Gap between Items in CSS pixels; each outer edge reserves half. Capped at half actionWidth. @default 8 */
  gap?: number
}>(), { as: 'div', side: 'end', actionWidth: 88, gap: 8 })
const context = injectSwipeActionsContext()
const active = computed(() => context.side.value === props.side)
const open = computed(() => active.value && context.open.value)
const reveal = computed(() => active.value ? context.reveal.value : 0)
const right = computed(() => (props.side === 'end') === (context.direction.value === 'ltr'))
const list: RegisteredList = {
  side: toRef(props, 'side'),
  actionWidth: toRef(props, 'actionWidth'),
  gap: toRef(props, 'gap'),
  defaultAction: toRef(props, 'defaultAction'),
}
provideSwipeActionsListContext(list)
let unregister: (() => void) | undefined
onMounted(() => unregister = context.registerList(list))
onBeforeUnmount(() => unregister?.())
const { forwardRef, currentElement } = useForwardExpose()
// VueUse disconnects this observer when the List unmounts. DOM order also
// covers keyed reorders that do not mount or unregister an Item.
useMutationObserver(currentElement, context.refreshOrder, { childList: true, subtree: true })
</script>

<template>
  <Primitive
    :ref="forwardRef" :as="as" :as-child="asChild"
    data-swipe-actions-list :data-side="side"
    :inert="!open" :aria-hidden="!open"
    :style="{ container: 'swipe-actions / inline-size', position: 'absolute', zIndex: 0, insetBlock: '0', right: right ? '0' : undefined, left: right ? undefined : '0', width: `${reveal}px`, visibility: reveal === 0 ? 'hidden' : 'visible', overflow: 'hidden' }"
  >
    <slot />
  </Primitive>
</template>
