<script setup lang="ts">
import { errorMessageFrom } from '@moeru/std'
import { useVisionStore } from '@proj-airi/stage-ui/stores/modules/vision'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import { modulesVisionPrepareScreenSourceSelection } from '../../../shared/eventa'
import { useElectronEventaInvoke } from '../../composables/electron-vueuse'

const visionStore = useVisionStore()
const { activeModel } = storeToRefs(visionStore)

const prepareScreenSourceSelection = useElectronEventaInvoke(modulesVisionPrepareScreenSourceSelection)

const isCapturing = ref(false)
const errorMessage = ref('')
const screenshotDataUrl = ref('')
const videoRef = ref<HTMLVideoElement | null>(null)

const statusLabel = computed(() => {
  if (isCapturing.value)
    return 'Capturing...'
  if (screenshotDataUrl.value)
    return 'Ready'

  return 'Idle'
})

async function captureFrame() {
  errorMessage.value = ''
  screenshotDataUrl.value = ''
  isCapturing.value = true

  try {
    await prepareScreenSourceSelection()

    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
    const video = videoRef.value

    if (!video) {
      stream.getTracks().forEach(track => track.stop())
      throw new Error('Video element not ready')
    }

    video.srcObject = stream
    await video.play()

    await new Promise<void>((resolve) => {
      if (video.readyState >= 2) {
        resolve()
        return
      }

      video.onloadedmetadata = () => resolve()
    })

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const ctx = canvas.getContext('2d')
    if (!ctx)
      throw new Error('Failed to create canvas context')

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    screenshotDataUrl.value = canvas.toDataURL('image/png')

    stream.getTracks().forEach(track => track.stop())
    video.pause()
    video.srcObject = null
  }
  catch (error) {
    errorMessage.value = `Failed to capture screen: ${errorMessageFrom(error)}`
  }
  finally {
    isCapturing.value = false
  }
}
</script>

<template>
  <div :class="['flex', 'flex-col', 'gap-6']">
    <div :class="['flex', 'items-center', 'justify-between', 'rounded-xl', 'bg-neutral-100', 'p-4', 'dark:bg-[rgba(0,0,0,0.3)]']">
      <div :class="['flex', 'flex-col', 'gap-1']">
        <div :class="['text-sm', 'uppercase', 'tracking-wide', 'text-neutral-400']">
          Vision model
        </div>
        <div :class="['text-lg', 'font-semibold']">
          {{ activeModel || 'Not configured' }}
        </div>
      </div>
      <div :class="['text-sm', 'text-neutral-400']">
        {{ statusLabel }}
      </div>
    </div>

    <div :class="['rounded-xl', 'bg-neutral-100', 'p-4', 'dark:bg-[rgba(0,0,0,0.3)]']">
      <div :class="['flex', 'flex-col', 'gap-4']">
        <button
          type="button"
          :class="[
            'rounded-lg',
            'bg-primary-500',
            'px-4',
            'py-2',
            'text-sm',
            'text-white',
            'transition',
            'duration-200',
            'ease-in-out',
            'hover:bg-primary-600',
            'disabled:cursor-not-allowed',
            'disabled:opacity-60',
          ]"
          :disabled="isCapturing"
          @click="captureFrame"
        >
          Capture screen frame
        </button>

        <div v-if="errorMessage" :class="['rounded-lg', 'bg-amber-100', 'p-3', 'text-sm', 'text-amber-700', 'dark:bg-amber-900/30', 'dark:text-amber-300']">
          {{ errorMessage }}
        </div>

        <div v-if="screenshotDataUrl" :class="['flex', 'flex-col', 'gap-3']">
          <img :src="screenshotDataUrl" alt="Captured screen" :class="['w-full', 'rounded-lg', 'object-contain']">
          <textarea
            :value="screenshotDataUrl"
            readonly
            :class="[
              'h-36',
              'w-full',
              'rounded-lg',
              'border',
              'border-neutral-200',
              'bg-white',
              'p-2',
              'text-xs',
              'text-neutral-700',
              'dark:border-neutral-800',
              'dark:bg-neutral-900',
              'dark:text-neutral-200',
            ]"
          />
        </div>
      </div>
    </div>

    <video ref="videoRef" :class="['hidden']" />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
</route>
