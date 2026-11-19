<script setup lang="ts" generic="Item extends TimelineItemRef">
import type { TimelineItemRef } from '../types'
import type { ListedItem } from '../utils/item-navigation'

import { computed } from 'vue'

import { elementRef, injectTimelineRootContext } from '../composables/timeline-root-context'
import { ITEM_MOVE_KEYS, neighborItem } from '../utils/item-navigation'

/**
 * The hidden item list, for screen readers, keyboards, and tests. A canvas draws the items, so this list gives each
 * item in the render range a button.
 *
 * Tab reaches one item: the focused item, else the selected one, else the first. Arrow keys, Home, and End move the
 * focus and the selection to a neighbor item (see `neighborItem`). A click on a button selects its item.
 */
const props = defineProps<{
  items: ListedItem<Item>[]
}>()

const emit = defineEmits<{
  /** The keyboard focused an item. A drawing layer can bring it into view and mark it. A quiet focus does not emit. */
  focus: [item: ListedItem<Item>]
  /** The keyboard focus left an item that `focus` reported. */
  blur: [item: ListedItem<Item>]
}>()

defineSlots<{
  /** The content of an item button. @default the item label */
  item: (props: { item: ListedItem<Item> }) => unknown
}>()

/** The list hides visually and stays in the accessibility tree. These are the `sr-only` styles, inline, so no stylesheet is needed. */
const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: '0',
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  borderWidth: '0',
} as const

const context = injectTimelineRootContext<Item>()
const bindElement = elementRef(context.itemListElement, HTMLElement)

const activeKey = computed(() => {
  const preferred = [context.focusedKey.value, context.selection.value?.key]
  for (const key of preferred) {
    if (key && props.items.some(item => item.target.key === key))
      return key
  }
  return props.items[0]?.target.key
})

function onFocus(item: ListedItem<Item>) {
  // A pointer click focused the item, so it is no keyboard focus.
  if (context.takeQuietFocus(item.target.key))
    return
  context.focusedKey.value = item.target.key
  emit('focus', item)
}

function onBlur(item: ListedItem<Item>) {
  if (context.focusedKey.value !== item.target.key)
    return
  context.focusedKey.value = undefined
  emit('blur', item)
}

function onKeydown(event: KeyboardEvent, item: ListedItem<Item>) {
  const move = ITEM_MOVE_KEYS[event.key]
  if (!move || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
    return
  // An edge keeps the key too, so it does not move the cursor of the timeline.
  event.preventDefault()
  event.stopPropagation()
  const next = neighborItem(props.items, item, move)
  if (!next)
    return
  context.selection.value = next.target
  context.focusItem(next.target.key)
}
</script>

<template>
  <ul :ref="bindElement" :style="VISUALLY_HIDDEN">
    <li v-for="item in items" :key="item.target.key">
      <button
        type="button"
        :data-item-key="item.target.key"
        :tabindex="item.target.key === activeKey ? 0 : -1"
        :aria-pressed="context.selection.value?.key === item.target.key"
        aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Home End Escape"
        @click="context.selection.value = item.target"
        @focus="onFocus(item)"
        @blur="onBlur(item)"
        @keydown="onKeydown($event, item)"
      >
        <slot name="item" :item="item">
          {{ item.label }}
        </slot>
      </button>
    </li>
  </ul>
</template>
