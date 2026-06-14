<script setup lang="ts">
import { defineInvoke } from '@moeru/eventa'
import { useElectronEventaContext, useElectronMouseAroundWindowBorder, useElectronMouseInWindow } from '@proj-airi/electron-vueuse'
import { createFadeAnimator, PoppinText } from '@proj-airi/stage-ui/components'
import { refDebounced, useBroadcastChannel } from '@vueuse/core'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import { captionGetIsFollowingWindow, captionIsFollowingWindowChanged } from '../../shared/eventa'
import { useCaptionItems } from '../composables/useCaptionItems'

/** Idle fade-out: the bubble auto-disappears this long after the last message. */
const CAPTION_TEXT_EXPIRY_MS = 5_000

const attached = ref(true)

const { isOutside: isOutsideWindow } = useElectronMouseInWindow()
const isOutsideWindowFor250Ms = refDebounced(isOutsideWindow, 250)
const shouldFadeOnCursorWithin = computed(() => !isOutsideWindowFor250Ms.value)

const { isNearAnyBorder: isAroundWindowBorder } = useElectronMouseAroundWindowBorder({ threshold: 30 })
const isAroundWindowBorderFor250Ms = refDebounced(isAroundWindowBorder, 250)

// Broadcast channel for captions
type CaptionChannelEvent = | { type: 'caption-speaker', text: string } | { type: 'caption-assistant', text: string }
const { data } = useBroadcastChannel<CaptionChannelEvent, CaptionChannelEvent>({ name: 'airi-caption-overlay' })
const { items: captionItems, add: addCaptionItem, dispose: disposeCaptionItems } = useCaptionItems({ ttlMs: CAPTION_TEXT_EXPIRY_MS })

const context = useElectronEventaContext()
const getAttached = defineInvoke(context.value, captionGetIsFollowingWindow)

const captionAnimatorByType = {
  'caption-speaker': createFadeAnimator({ duration: 180 }),
  'caption-assistant': createFadeAnimator({ duration: 180 }),
} satisfies Record<CaptionChannelEvent['type'], ReturnType<typeof createFadeAnimator>>

const captionTypes = [
  'caption-speaker',
  'caption-assistant',
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
}))

// Whether there's any live caption to show. Drives the bubble's pop-in / fade-out:
// empty -> the (transparent, click-through) overlay is effectively invisible above the pet.
const hasCaption = computed(() =>
  captionTextByType.value['caption-speaker'].length > 0
  || captionTextByType.value['caption-assistant'].length > 0,
)

onMounted(async () => {
  try {
    const isAttached = await getAttached()
    attached.value = Boolean(isAttached)
  }
  catch {}

  try {
    context.value.on(captionIsFollowingWindowChanged, (event) => {
      attached.value = Boolean(event?.body)
    })
  }
  catch {}

  try {
    // Update texts from broadcast channel
    watch(data, (event) => {
      if (!event)
        return
      if (event.type === 'caption-speaker') {
        addCaptionItem(event)
      }
      else if (event.type === 'caption-assistant') {
        addCaptionItem(event)
      }
    }, { immediate: true })
  }
  catch {}
})

onUnmounted(() => {
  disposeCaptionItems()
})
</script>

<template>
  <div class="pointer-events-none relative h-full w-full flex items-end justify-center pb-2">
    <!-- Speech bubble: pops in above the pet on a new message, fades out when captions expire -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="op-0 scale-90 translate-y-2"
      enter-to-class="op-100 scale-100 translate-y-0"
      leave-active-class="transition-all duration-300 ease-in"
      leave-from-class="op-100 scale-100"
      leave-to-class="op-0 scale-95"
    >
      <div
        v-if="hasCaption"
        :class="[
          shouldFadeOnCursorWithin ? 'op-0' : 'op-100',
          'pointer-events-auto relative max-w-[92%] select-none',
          'rounded-2xl px-3.5 py-2.5',
          'bg-neutral-900/72 ring-1 ring-white/12 shadow-lg shadow-black/30 backdrop-blur-md',
          'transition-opacity duration-250 ease-in-out',
        ]"
      >
        <div
          v-show="!attached"
          class="[-webkit-app-region:drag] absolute left-1/2 h-[14px] w-[36px] border border-white/25 rounded-[10px] bg-white/20 backdrop-blur-[6px] -top-3 -translate-x-1/2"
          title="Drag to move"
        >
          <div class="absolute left-1/2 top-1/2 h-[3px] w-4 rounded-full bg-white/85 -translate-x-1/2 -translate-y-1/2" />
        </div>

        <div class="flex flex-col gap-0.5">
          <div
            v-for="type in captionTypes"
            v-show="captionTextByType[type].length > 0"
            :key="type"
            :class="[
              type === 'caption-speaker' ? 'text-[0.95rem] text-neutral-300/90 font-medium' : '',
              type === 'caption-assistant' ? 'text-[1.2rem] text-primary-100 font-semibold leading-snug' : '',
            ]"
          >
            <PoppinText
              :text="captionTextByType[type]"
              :animator="captionAnimatorByType[type]"
              :text-class="type === 'caption-assistant' ? 'color-primary-50! align-middle' : 'color-neutral-200! align-middle'"
            />
          </div>
        </div>

        <!-- downward tail pointing at the pet's head -->
        <div class="absolute left-1/2 h-3 w-3 rotate-45 rounded-[2px] bg-neutral-900/72 ring-1 ring-white/12 -bottom-1.5 -translate-x-1/2" />
      </div>
    </Transition>

    <Transition
      enter-active-class="transition-opacity duration-250 ease-in-out"
      enter-from-class="opacity-50"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-250 ease-in-out"
      leave-from-class="opacity-100"
      leave-to-class="opacity-50"
    >
      <div v-if="isAroundWindowBorderFor250Ms" class="pointer-events-none absolute left-0 top-0 z-999 h-full w-full">
        <div
          :class="[
            'b-primary/50',
            'h-full w-full animate-flash animate-duration-3s animate-count-infinite b-4 rounded-2xl',
          ]"
        />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
</style>

<route lang="yaml">
meta:
  layout: stage
</route>
