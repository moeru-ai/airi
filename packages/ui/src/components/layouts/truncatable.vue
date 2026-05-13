<script setup lang="ts">
/**
 * Amazing work by Derek Morash on CSS line-clamp animation.
 *
 * https://derekmorash.com/writing/css-line-clamp-animation/
 */

import { useResizeObserver } from '@vueuse/core'
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, useTemplateRef } from 'vue'

defineOptions({
  name: 'Truncatable',
})

const props = withDefaults(defineProps<TruncatableProps>(), {
  lineClamp: 3,
})

/**
 * Props for a text/content container that can be line-clamped and expanded.
 */
interface TruncatableProps {
  /**
   * Maximum visible lines while collapsed.
   *
   * @default 3
   */
  lineClamp?: number
}

const contentRef = useTemplateRef<HTMLElement>('content')

/**
 * Matches the CSS max-height transition so closing can finish before line-clamp
 * is restored to the inner content.
 */
const transitionDurationMs = 300

const expanded = shallowRef(false)
const lineClamped = shallowRef(true)
const closedHeight = shallowRef(0)
const openedHeight = shallowRef(0)
const isOverflowing = shallowRef(false)
const closeClampTimer = shallowRef<number>()

const normalizedLineClamp = computed(() => Math.max(1, Math.floor(props.lineClamp)))
const visibleHeight = computed(() => expanded.value ? openedHeight.value : closedHeight.value)
const contentStyle = computed(() => ({
  '--truncatable-line-clamp': String(normalizedLineClamp.value),
  '--truncatable-transition-duration': `${transitionDurationMs}ms`,
  'maxHeight': visibleHeight.value > 0 ? `${visibleHeight.value}px` : undefined,
}))
const containerRole = computed(() => isOverflowing.value ? 'button' : undefined)
const containerTabindex = computed(() => isOverflowing.value ? 0 : undefined)

function measureClampedHeight(element: HTMLElement) {
  const previousDisplay = element.style.display
  const previousOverflow = element.style.overflow
  const previousWebkitBoxOrient = element.style.webkitBoxOrient
  const previousWebkitLineClamp = element.style.webkitLineClamp

  // DOM measurement needs the real rendered width, so temporarily apply the
  // collapsed CSS to the visible content and restore the previous inline styles.
  element.style.display = '-webkit-box'
  element.style.overflow = 'hidden'
  element.style.webkitBoxOrient = 'vertical'
  element.style.webkitLineClamp = String(normalizedLineClamp.value)

  const height = element.getBoundingClientRect().height

  element.style.display = previousDisplay
  element.style.overflow = previousOverflow
  element.style.webkitBoxOrient = previousWebkitBoxOrient
  element.style.webkitLineClamp = previousWebkitLineClamp

  return height
}

async function measureHeights() {
  await nextTick()

  const element = contentRef.value
  if (!element)
    return

  const nextClosedHeight = measureClampedHeight(element)
  const nextOpenedHeight = element.scrollHeight

  closedHeight.value = nextClosedHeight
  openedHeight.value = nextOpenedHeight
  isOverflowing.value = nextOpenedHeight > nextClosedHeight + 1

  if (!isOverflowing.value) {
    expanded.value = false
    lineClamped.value = true
  }
}

function toggleExpanded() {
  if (!isOverflowing.value)
    return

  if (closeClampTimer.value != null)
    window.clearTimeout(closeClampTimer.value)

  if (expanded.value) {
    expanded.value = false
    closeClampTimer.value = window.setTimeout(() => {
      lineClamped.value = true
      closeClampTimer.value = undefined
    }, transitionDurationMs)
    return
  }

  lineClamped.value = false
  expanded.value = !expanded.value
}

function handleContainerKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ' ')
    return

  event.preventDefault()
  toggleExpanded()
}

onMounted(measureHeights)
onBeforeUnmount(() => {
  if (closeClampTimer.value != null)
    window.clearTimeout(closeClampTimer.value)
})
useResizeObserver(contentRef, measureHeights)
</script>

<template>
  <div
    class="truncatable"
    :class="{ 'truncatable--interactive': isOverflowing }"
    :style="contentStyle"
    :role="containerRole"
    :tabindex="containerTabindex"
    :aria-expanded="isOverflowing ? expanded : undefined"
    @click="toggleExpanded"
    @keydown="handleContainerKeydown"
  >
    <div
      ref="content"
      class="truncatable__inner"
      :class="{ 'truncatable__inner--line-clamped': lineClamped }"
    >
      <slot />
    </div>
  </div>
</template>

<style scoped>
.truncatable {
  width: 100%;
  overflow: hidden;
  transition: max-height var(--truncatable-transition-duration) ease;
}

.truncatable--interactive {
  cursor: pointer;
}

.truncatable:focus-visible {
  outline: 2px solid currentcolor;
  outline-offset: 2px;
}

.truncatable__inner--line-clamped {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: var(--truncatable-line-clamp);
}
</style>
