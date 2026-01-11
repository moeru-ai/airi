<script setup lang="ts">
import type { SerializableDesktopCapturerSource } from '@proj-airi/electron-screen-capture'

import { useElectronScreenCapture } from '@proj-airi/electron-screen-capture/vue'
import { Button } from '@proj-airi/ui'
import { onBeforeUnmount, onMounted, ref } from 'vue'

const sources = ref<ScreenCaptureSource[]>([])
const isRefetching = ref(false)
const activeStreams = ref<MediaStream[]>([])

interface ScreenCaptureSource extends SerializableDesktopCapturerSource {
  appIconURL?: string
  thumbnailURL?: string
}

const { getSources, selectWithSource } = useElectronScreenCapture(window.electron.ipcRenderer, {
  types: ['screen', 'window'],
  fetchWindowIcons: true,
})

function toObjectUrl(bytes: Uint8Array, mime: string) {
  return URL.createObjectURL(new Blob([bytes.slice().buffer], { type: mime }))
}

async function startCapture(source: SerializableDesktopCapturerSource) {
  try {
    await selectWithSource(() => source.id, async () => {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      })
      activeStreams.value.push(stream)
    })
  }
  catch (err) {
    console.error('Error selecting source:', err)
  }
}

function stopStream(stream: MediaStream) {
  stream.getTracks().forEach(track => track.stop())
  const index = activeStreams.value.indexOf(stream)
  if (index !== -1) {
    activeStreams.value.splice(index, 1)
  }
}

async function refetchSources() {
  try {
    isRefetching.value = true

    const nextSources = (await getSources())
      .sort((a, b) => {
        if (a.id.startsWith('screen:') && b.id.startsWith('window:'))
          return -1
        if (a.id.startsWith('window:') && b.id.startsWith('screen:'))
          return 1
        return a.name.localeCompare(b.name)
      })

    sources.value.forEach((oldSource) => {
      if (oldSource.appIconURL)
        URL.revokeObjectURL(oldSource.appIconURL)
      if (oldSource.thumbnailURL)
        URL.revokeObjectURL(oldSource.thumbnailURL)
    })

    sources.value = nextSources.map(source => ({
      ...source,
      appIconURL: source.appIcon && source.appIcon.length > 0 ? toObjectUrl(source.appIcon, 'image/png') : undefined,
      thumbnailURL: source.thumbnail && source.thumbnail.length > 0 ? toObjectUrl(source.thumbnail, 'image/jpeg') : undefined,
    }))
  }
  finally {
    isRefetching.value = false
  }
}

onMounted(async () => {
  refetchSources()
})

onBeforeUnmount(() => {
  sources.value.forEach((source) => {
    if (source.appIconURL)
      URL.revokeObjectURL(source.appIconURL)
    if (source.thumbnailURL)
      URL.revokeObjectURL(source.thumbnailURL)
  })
})
</script>

<template>
  <div
    flex="~ col gap-4 items-start" w-full
    text="neutral-500 dark:neutral-400"
  >
    <div
      v-if="activeStreams.length > 0"
      bg="primary-300/10"
      b="2 solid primary-400/70"
      w-full overflow-hidden rounded-2xl p-3
      flex="~ col gap-2"
    >
      <div flex="~ row items-center gap-2">
        <div class="i-solar:videocamera-record-line-duotone" />
        <div>Capturing</div>
      </div>
      <div
        flex="~ row items-center gap-3"
        w-full overflow-x-auto
      >
        <div
          v-for="stream in activeStreams" :key="stream.id"
          relative overflow-hidden rounded-lg
        >
          <div
            flex="~ col items-center justify-center gap-1"
            absolute right-0 top-0 z-10 h-full w-full cursor-pointer
            rounded-lg op-0 backdrop-blur-sm hover:op-100
            transition="all duration-200"
            text="light"
            bg="black/30"
            @click="stopStream(stream)"
          >
            <div class="i-solar:stop-line-duotone" />
            <div text-sm>
              Stop
            </div>
          </div>
          <video
            autoplay
            muted
            playsinline
            :srcObject="stream"
            h-140px
            w-auto
          />
        </div>
      </div>
    </div>

    <div
      flex="~ col gap-3"
      w-full pb-6
    >
      <div flex="~ row items-center justify-between" w-full>
        <div>{{ sources.length }} source(s)</div>
        <Button
          :label="isRefetching ? 'Refetching...' : 'Refetch'"
          icon="i-solar:refresh-line-duotone"
          size="sm"
          :disabled="isRefetching"
          @click="refetchSources()"
        />
      </div>
      <div grid="~ cols-1 sm:cols-2 md:cols-3 lg:cols-4 xl:cols-5 gap-3">
        <div
          v-for="source in sources"
          :key="source.id"
          flex="~ col justify-between gap-3"
          w-full cursor-pointer rounded-2xl p-3
          transition="all duration-200"
          border="2 solid neutral-200/60 dark:neutral-800/10 hover:primary-400/70"
          @click="startCapture(source)"
        >
          <div flex="~ col items-start w-full">
            <div flex="~ row items-center gap-1">
              <div class="h-16px w-16px">
                <img
                  v-if="source.appIconURL"
                  :src="source.appIconURL"
                  :alt="source.id.startsWith('screen:') ? 'Screen Icon' : 'Window Icon'"
                  class="h-full w-full shrink-0"
                >
                <div
                  v-else-if="source.id.startsWith('screen:')"
                  h-full w-full
                  class="i-solar:screencast-2-line-duotone"
                />
                <div
                  v-else
                  h-full w-full
                  class="i-solar:window-frame-line-duotone"
                />
              </div>

              <div text-sm>
                {{ source.id.startsWith('screen:') ? 'Screen' : 'Window' }}
              </div>
            </div>

            <div text-ellipsis break-all>
              {{ source.name }}
            </div>
            <div text-sm font-mono text="neutral-400 dark:neutral-600">
              {{ source.id }}
            </div>
          </div>
          <div
            h-200px w-full overflow-hidden rounded-2xl bg-black
            flex="~ items-center justify-center shrink-0"
          >
            <img
              v-if="source.thumbnailURL"
              :src="source.thumbnailURL"
              alt="Thumbnail"
              h-full
              w-full object-contain
            >
            <div
              v-else
              class="i-solar:forbidden-circle-line-duotone"
              h-10 w-10 bg-light
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
</route>
