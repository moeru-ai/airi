<script setup lang="ts">
import { useEventListener, useMutationObserver, useResizeObserver } from '@vueuse/core'
import { reactive, useTemplateRef } from 'vue'

/**
 * A part of an unfolded tool call that can grow long, such as a payload or a description.
 * It scrolls inside a fixed height, and its content fades out at each edge where it goes on.
 */

/**
 * Longest fade at an edge in pixels, about one line of the payload.
 * The content fades itself, so the panel shows through in any theme. A blur layer over the edge showed a lighter box on the translucent panel.
 */
const FADE_LENGTH = 20

const scroller = useTemplateRef<HTMLElement>('scroller')
const fade = reactive({ top: 0, bottom: 0 })

// Each fade grows with the hidden distance on its side and shrinks to nothing at the end of the scroll,
// so an edge never appears or disappears in one step.
function measureFade() {
  const element = scroller.value
  if (!element)
    return
  const hiddenBelow = Math.max(0, element.scrollHeight - element.clientHeight - element.scrollTop)
  fade.top = Math.min(FADE_LENGTH, element.scrollTop)
  fade.bottom = Math.min(FADE_LENGTH, hiddenBelow)
}

useEventListener(scroller, 'scroll', measureFade, { passive: true })
// The box resizes when the window rewraps the text. Inside the fixed height, only a content change shows that a streamed result grew.
useResizeObserver(scroller, measureFade)
useMutationObserver(scroller, measureFade, { childList: true, subtree: true, characterData: true })
</script>

<template>
  <div
    ref="scroller"
    :class="[
      'flex flex-col max-h-72 overflow-auto',
      'mask-[linear-gradient(to_bottom,transparent,black_var(--fade-top),black_calc(100%_-_var(--fade-bottom)),transparent)]',
    ]"
    :style="{ '--fade-top': `${fade.top}px`, '--fade-bottom': `${fade.bottom}px` }"
  >
    <slot />
  </div>
</template>
