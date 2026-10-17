<script setup lang="ts">
import type { CaptionChannelEvent } from '@proj-airi/stage-shared'

import { listenCaptions } from '@proj-airi/stage-shared'
import { computed, onUnmounted } from 'vue'

import PoppinText from '../widgets/poppin-text/PoppinText.web.vue'

import { useCaptionItems } from '../../services/caption-items'
import { createFadeAnimator } from '../widgets/poppin-text/animators/fade'

/** Keep stale captions from lingering after the last broadcast update. */
const CAPTION_TEXT_EXPIRY_MS = 10_000

// The eventa caption bus dispatches to every listener of the document, so one
// component serves the desktop caption window and the in-page web overlay.
const { items: captionItems, add: addCaptionItem, dispose: disposeCaptionItems } = useCaptionItems({ ttlMs: CAPTION_TEXT_EXPIRY_MS })

const captionAnimatorByType = {
  'caption-speaker': createFadeAnimator({ duration: 180 }),
  'caption-assistant': createFadeAnimator({ duration: 180 }),
  'caption-assistant-translation': createFadeAnimator({ duration: 180 }),
} satisfies Record<CaptionChannelEvent['type'], ReturnType<typeof createFadeAnimator>>

const captionTypes = [
  'caption-speaker',
  'caption-assistant',
  'caption-assistant-translation',
] satisfies CaptionChannelEvent['type'][]

function toCaptionTextSegments(type: CaptionChannelEvent['type']) {
  return captionItems.value
    .filter(item => item.type === type)
    .map((item, index) => ({
      key: item.id,
      text: index === 0 ? item.text : ` ${item.text}`,
    }))
}

const captionTextByType = computed(() => ({
  'caption-speaker': toCaptionTextSegments('caption-speaker'),
  'caption-assistant': toCaptionTextSegments('caption-assistant'),
  'caption-assistant-translation': toCaptionTextSegments('caption-assistant-translation'),
}))

/** Returns the language badge text for one caption type, if present. */
function captionLabelFor(type: CaptionChannelEvent['type']) {
  return captionItems.value.find(item => item.type === type)?.label
}

const stopListenCaptions = listenCaptions(addCaptionItem)

onUnmounted(() => {
  stopListenCaptions()
  disposeCaptionItems()
})
</script>

<template>
  <div class="max-w-[80vw] flex flex-col gap-1">
    <div
      v-for="type in captionTypes"
      v-show="captionTextByType[type].length > 0"
      :key="type"
      :class="[
        type === 'caption-speaker'
          ? [
            'rounded-md px-2 py-1',
            'text-[1.1rem] text-neutral-50 font-medium',
            'text-shadow-lg text-shadow-color-neutral-900/60',
          ]
          : '',
        type === 'caption-assistant'
          ? [
            'rounded-md px-2 py-1',
            'text-[1.35rem] text-primary-50 font-semibold',
            'text-stroke-4 text-stroke-primary-300/50',
            'text-shadow-lg text-shadow-color-primary-700/50',
          ]
          : '',
        type === 'caption-assistant-translation'
          ? [
            'flex flex-col items-center gap-0.5',
            'rounded-md px-0.5 py-0.5',
            'text-[1rem] text-neutral-200/90 dark:text-neutral-300/90',
            'text-shadow-lg text-shadow-color-neutral-900/50',
          ]
          : '',
      ]"
      :style="type === 'caption-assistant' ? { paintOrder: 'stroke fill' } : undefined"
    >
      <!-- No background fill: a translucent fill on the desktop frameless
           transparent window composites as a black patch during the hover
           opacity transition and row teardown. -->
      <span
        v-if="type === 'caption-assistant-translation' && captionLabelFor(type)"
        class="text-[0.65rem] text-neutral-300/80 leading-tight tracking-wide text-shadow-lg text-shadow-color-neutral-900/60"
      >
        {{ captionLabelFor(type) }}
      </span>
      <PoppinText
        :text="captionTextByType[type]"
        :animator="captionAnimatorByType[type]"
        :text-class="
          type === 'caption-assistant-translation'
            ? 'color-neutral-200! dark:color-neutral-300! align-middle'
            : 'color-neutral-50! align-middle'
        "
      />
    </div>
  </div>
</template>
