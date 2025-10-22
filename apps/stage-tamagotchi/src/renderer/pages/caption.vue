<script setup lang="ts">
import { defineInvoke } from '@unbird/eventa'
import { createContext } from '@unbird/eventa/adapters/electron/renderer'
import { onMounted, ref } from 'vue'

import { captionGetIsFollowingWindow, captionIsFollowingWindowChanged } from '../../shared/eventa'

const attached = ref(true)

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
})
</script>

<template>
  <div class="pointer-events-none h-full w-full flex items-end justify-center">
    <div class="pointer-events-auto relative select-none rounded-xl bg-primary-950/10 px-3 py-2 shadow-md backdrop-blur-md dark:bg-neutral-900/70">
      <div
        v-show="!attached"
        class="[-webkit-app-region:drag] absolute left-1/2 h-[14px] w-[36px] border border-[rgba(125,125,125,0.35)] rounded-[10px] bg-[rgba(125,125,125,0.28)] backdrop-blur-[6px] -top-2 -translate-x-1/2"
        title="Drag to move"
      >
        <div class="absolute left-1/2 top-1/2 h-[3px] w-4 rounded-full bg-[rgba(255,255,255,0.85)] -translate-x-1/2 -translate-y-1/2" />
      </div>
      <div
        class="content text-primary-50 tracking-widest font-cute text-stroke-4 text-stroke-primary-300/50 text-shadow-lg text-shadow-color-primary-700/50"
        :style="{ paintOrder: 'stroke fill', fontSize: '2rem' }"
      >
        This is a test message caption overlay.
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
