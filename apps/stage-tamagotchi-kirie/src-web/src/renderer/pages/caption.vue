<script setup lang="ts">
import type { CaptionChannelEvent } from '@proj-airi/stage-shared'

import { defineInvoke } from '@moeru/eventa'
import { useHostEventaContext, useHostMouseAroundWindowBorder, useHostMouseInWindow } from '@proj-airi/stage-host-context'
import { createFadeAnimator, PoppinText } from '@proj-airi/stage-ui/components'
import { useSettingsGeneral } from '@proj-airi/stage-ui/stores/settings'
import { refDebounced, useBroadcastChannel } from '@vueuse/core'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import { captionGetIsFollowingWindow, captionIsFollowingWindowChanged } from '../../shared/eventa'
import { useCaptionItems } from '../composables/useCaptionItems'

/** Keep stale captions from lingering after the last broadcast update. */
const CAPTION_TEXT_EXPIRY_MS = 10_000

const attached = ref(true)
const settingsGeneral = useSettingsGeneral()

const { isOutside: isOutsideWindow } = useHostMouseInWindow()
const isOutsideWindowFor250Ms = refDebounced(isOutsideWindow, 250)
const shouldFadeOnCursorWithin = computed(() => !isOutsideWindowFor250Ms.value)

const { isNearAnyBorder: isAroundWindowBorder } = useHostMouseAroundWindowBorder({ threshold: 30 })
const isAroundWindowBorderFor250Ms = refDebounced(isAroundWindowBorder, 250)

// Broadcast channel for captions
const { data } = useBroadcastChannel<CaptionChannelEvent, CaptionChannelEvent>({ name: 'airi-caption-overlay' })
const { items: captionItems, add: addCaptionItem, dispose: disposeCaptionItems } = useCaptionItems({ ttlMs: CAPTION_TEXT_EXPIRY_MS })

const context = useHostEventaContext()
const getAttached = defineInvoke(context.value, captionGetIsFollowingWindow)

const captionAnimatorByType = {
  'caption-speaker': createFadeAnimator({ duration: 180 }),
  'caption-assistant': createFadeAnimator({ duration: 180 }),
  'caption-translation': createFadeAnimator({ duration: 180 }),
} satisfies Record<CaptionChannelEvent['type'], ReturnType<typeof createFadeAnimator>>

const captionTypes = [
  'caption-speaker',
  'caption-assistant',
  'caption-translation',
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
  'caption-translation': toCaptionTextSegments('caption-translation'),
}))

const captionColors = computed(() => ({
  'caption-speaker': { color: settingsGeneral.captionSpeakerColor, WebkitTextStrokeColor: settingsGeneral.captionSpeakerStrokeColor },
  'caption-assistant': { color: settingsGeneral.captionAssistantColor, WebkitTextStrokeColor: settingsGeneral.captionAssistantStrokeColor },
  'caption-translation': { color: settingsGeneral.captionTranslationColor, WebkitTextStrokeColor: settingsGeneral.captionTranslationStrokeColor },
}))

watch(data, (event) => {
  if (event && captionTypes.includes(event.type))
    addCaptionItem(event)
}, { immediate: true })

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
})

onUnmounted(() => {
  disposeCaptionItems()
})
</script>

<template>
  <div :class="['pointer-events-none relative h-full w-full', 'flex items-end justify-center']">
    <div
      :class="[
        shouldFadeOnCursorWithin ? 'op-0' : 'op-100',
        'pointer-events-auto relative select-none rounded-xl px-3 py-2',
        'transition-opacity duration-250 ease-in-out',
      ]"
    >
      <div
        v-show="!attached"
        :class="['[-webkit-app-region:drag] absolute left-1/2 -top-2 -translate-x-1/2', 'h-[14px] w-[36px] rounded-[10px]', 'border border-[rgba(125,125,125,0.35)] bg-[rgba(125,125,125,0.28)] backdrop-blur-[6px]']"
        title="Drag to move"
      >
        <div :class="['absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2', 'h-[3px] w-4 rounded-full bg-[rgba(255,255,255,0.85)]']" />
      </div>

      <div :class="['max-w-[80vw] flex flex-col gap-1']">
        <div
          v-for="type in captionTypes"
          v-show="captionTextByType[type].length > 0 && (type !== 'caption-translation' || settingsGeneral.translationSubtitleEnabled)"
          :key="type"
          :class="[
            'rounded-md px-2 py-1 text-stroke-2 text-shadow-lg text-shadow-color-neutral-900/60',
            type === 'caption-assistant' ? 'text-[1.35rem] font-semibold' : 'text-[1.1rem] font-medium',
          ]"
          :style="{ ...captionColors[type], paintOrder: 'stroke fill' }"
        >
          <PoppinText
            :text="captionTextByType[type]"
            :animator="captionAnimatorByType[type]"
            text-class="color-inherit! align-middle"
          />
        </div>
      </div>
    </div>

    <Transition
      enter-active-class="transition-opacity duration-250 ease-in-out"
      enter-from-class="opacity-50"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-250 ease-in-out"
      leave-from-class="opacity-100"
      leave-to-class="opacity-50"
    >
      <div v-if="isAroundWindowBorderFor250Ms" :class="['pointer-events-none absolute left-0 top-0 z-999', 'h-full w-full']">
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
