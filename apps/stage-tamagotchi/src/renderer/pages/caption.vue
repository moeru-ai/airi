<script setup lang="ts">
import { defineInvoke } from '@unbird/eventa'
import { createContext } from '@unbird/eventa/adapters/electron/renderer'
import { useBroadcastChannel } from '@vueuse/core'
import { onMounted, ref, watch } from 'vue'

import { captionGetIsFollowingWindow, captionIsFollowingWindowChanged } from '../../shared/eventa'

const attached = ref(true)
const speakerText = ref('')
const assistantText = ref('')

// Broadcast channel for captions
type CaptionChannelEvent
  = | { type: 'caption-speaker', text: string }
    | { type: 'caption-assistant', text: string }
const { data } = useBroadcastChannel<CaptionChannelEvent, CaptionChannelEvent>({ name: 'airi-caption-overlay' })

const { context } = createContext(window.electron.ipcRenderer)
const getAttached = defineInvoke(context, captionGetIsFollowingWindow)

onMounted(async () => {
  try {
    const isAttached = await getAttached()
    attached.value = Boolean(isAttached)
  }
  catch {}

  try {
    context.on(captionIsFollowingWindowChanged, (event) => {
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
  <div class="pointer-events-none h-full w-full flex items-end justify-center">
    <div class="pointer-events-auto relative select-none rounded-xl px-3 py-2">
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
  </div>
</template>

<style scoped>
</style>

<route lang="yaml">
meta:
  layout: stage
</route>
