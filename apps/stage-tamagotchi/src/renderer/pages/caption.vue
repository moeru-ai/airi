<script setup lang="ts">
import { defineInvoke } from '@moeru/eventa'
import { refDebounced, useBroadcastChannel } from '@vueuse/core'
import { computed, onMounted, ref, watch } from 'vue'

import { captionGetIsFollowingWindow, captionIsFollowingWindowChanged } from '../../shared/eventa'
import { useElectronEventaContext, useElectronMouseAroundWindowBorder, useElectronMouseInWindow } from '../composables/electron-vueuse'

const attached = ref(true)
const speakerText = ref('')
const assistantText = ref('')
const { isOutside: isOutsideWindow } = useElectronMouseInWindow()
const isOutsideWindowFor250Ms = refDebounced(isOutsideWindow, 250)
const shouldFadeOnCursorWithin = computed(() => !isOutsideWindowFor250Ms.value)
const { isNearAnyBorder: isAroundWindowBorder } = useElectronMouseAroundWindowBorder({ threshold: 30 })
const isAroundWindowBorderFor250Ms = refDebounced(isAroundWindowBorder, 250)

// Broadcast channel for captions
type CaptionChannelEvent
  = | { type: 'caption-speaker', text: string }
    | { type: 'caption-assistant', text: string }
const { data } = useBroadcastChannel<CaptionChannelEvent, CaptionChannelEvent>({ name: 'airi-caption-overlay' })

const context = useElectronEventaContext()
const getAttached = defineInvoke(context.value, captionGetIsFollowingWindow)

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
        speakerText.value = event.text
      }
      else if (event.type === 'caption-assistant') {
        assistantText.value = event.text
      }
    }, { immediate: true })
  }
  catch {}
})
</script>

<template>
  <div class="pointer-events-none relative h-full w-full flex items-end justify-center">
    <div
      :class="[
        shouldFadeOnCursorWithin ? 'op-0' : 'op-100',
        'pointer-events-auto relative select-none rounded-xl px-3 py-2',
        'transition-opacity duration-250 ease-in-out',
      ]"
    >
      <div
        v-show="!attached"
        class="[-webkit-app-region:drag] absolute left-1/2 h-[14px] w-[36px] border border-[rgba(125,125,125,0.35)] rounded-[10px] bg-[rgba(125,125,125,0.28)] backdrop-blur-[6px] -top-2 -translate-x-1/2"
        title="Drag to move"
      >
        <div class="absolute left-1/2 top-1/2 h-[3px] w-4 rounded-full bg-[rgba(255,255,255,0.85)] -translate-x-1/2 -translate-y-1/2" />
      </div>

      <div class="max-w-[80vw] flex flex-col gap-1">
        <div
          v-if="speakerText"
          class="rounded-md px-2 py-1 text-[1.1rem] text-neutral-50 font-medium text-shadow-lg text-shadow-color-neutral-900/60"
        >
          {{ speakerText }}
        </div>
        <div
          v-if="assistantText"
          class="rounded-md px-2 py-1 text-[1.35rem] text-primary-50 font-semibold text-stroke-4 text-stroke-primary-300/50 text-shadow-lg text-shadow-color-primary-700/50"
          :style="{ paintOrder: 'stroke fill' }"
        >
          {{ assistantText }}
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
