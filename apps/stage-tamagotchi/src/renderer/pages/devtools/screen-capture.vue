<script setup lang="ts">
import type { SerializableDesktopCapturerSource } from '@proj-airi/electron-screen-capture'
import type { SourcesOptions } from 'electron'

import { useElectronScreenCapture } from '@proj-airi/electron-screen-capture/vue'
import { Button, SelectTab } from '@proj-airi/ui'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import WithScreenCapture from '../../components/WithScreenCapture.vue'

interface ScreenCaptureSource extends SerializableDesktopCapturerSource {
  appIconURL?: string
  thumbnailURL?: string
}

type SourceCategory = 'applications' | 'displays' | 'devices'

const sources = ref<ScreenCaptureSource[]>([])
const isRefetching = ref(false)
const activeStreams = ref<MediaStream[]>([])
const sourceCategory = ref<SourceCategory>('applications')
const hasFetchedOnce = ref(false)

const sourcesOptions = ref<SourcesOptions>({
  types: ['screen', 'window'],
  fetchWindowIcons: true,
})

const { t } = useI18n()
const {
  getSources,
  selectWithSource,
} = useElectronScreenCapture(window.electron.ipcRenderer, sourcesOptions)

const categoryOptions = [
  { label: 'Applications', value: 'applications', icon: 'i-solar:window-frame-line-duotone' },
  { label: 'Displays', value: 'displays', icon: 'i-solar:screencast-2-line-duotone' },
  { label: 'Devices', value: 'devices', icon: 'i-solar:smartphone-2-line-duotone' },
]

const isDisplaySource = (source: ScreenCaptureSource) => source.id.startsWith('screen:')
const isWindowSource = (source: ScreenCaptureSource) => source.id.startsWith('window:')
const isDeviceSource = (source: ScreenCaptureSource) => source.id.startsWith('device:')

const filteredSources = computed(() => {
  if (sourceCategory.value === 'applications')
    return sources.value.filter(isWindowSource)
  if (sourceCategory.value === 'displays')
    return sources.value.filter(isDisplaySource)
  return sources.value.filter(isDeviceSource)
})

const sourceCounts = computed(() => ({
  applications: sources.value.filter(isWindowSource).length,
  displays: sources.value.filter(isDisplaySource).length,
  devices: sources.value.filter(isDeviceSource).length,
}))

const isInitialLoading = computed(() => !hasFetchedOnce.value && isRefetching.value)

const refetchLabel = computed(() => {
  if (isInitialLoading.value)
    return 'Loading...'
  return isRefetching.value ? 'Refetching...' : 'Refetch'
})

const refetchIcon = computed(() =>
  isInitialLoading.value ? 'i-svg-spinners:ring-resize' : 'i-solar:refresh-line-duotone',
)

function getShareLabel(source: ScreenCaptureSource) {
  if (isDisplaySource(source))
    return 'Share Screen'
  if (isDeviceSource(source))
    return 'Share Device'
  return 'Share Window'
}

function toLocalArrayBuffer(bytes: Uint8Array) {
  if (typeof SharedArrayBuffer !== 'undefined' && bytes.buffer instanceof SharedArrayBuffer) {
    return bytes.slice().buffer
  }
  return bytes.buffer as ArrayBuffer
}

function toObjectUrl(bytes: Uint8Array, mime: string) {
  return URL.createObjectURL(new Blob([toLocalArrayBuffer(bytes)], { type: mime }))
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
        const aIsScreen = a.id.startsWith('screen:')
        const bIsScreen = b.id.startsWith('screen:')
        if (aIsScreen !== bIsScreen)
          return aIsScreen ? -1 : 1

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
      // NOTICE(@nekomeowww): In probability of 9/10, the window thumbnail is purely empty or black, sources printed and
      // nothing is returned from the desktopCapturer API.
      // NOTICE(@sumimakito): Not only thumbnail is empty, the appIcon could be empty as well with nothing returned.
      // REVIEW(@sumimakito): This has nothing to do with our side, probably related to a Electron bug, you can
      // read more here https://github.com/electron/electron/issues/44504
      appIconURL: source.appIcon && source.appIcon.length > 0 ? toObjectUrl(source.appIcon, 'image/png') : undefined,
      thumbnailURL: source.thumbnail && source.thumbnail.length > 0 ? toObjectUrl(source.thumbnail, 'image/jpeg') : undefined,
    }))
  }
  catch (err) {
    console.error('Error fetching sources:', err)
  }
  finally {
    isRefetching.value = false
    hasFetchedOnce.value = true
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
  <WithScreenCapture :sources-options="sourcesOptions">
    <template #default="{ hasPermissions, requestPermission }">
      <div
        v-if="hasPermissions"
        :class="[
          'flex', 'w-full', 'flex-col', 'items-start', 'gap-4',
          'text-neutral-500', 'dark:text-neutral-400',
        ]"
      >
        <div
          v-if="activeStreams.length > 0"
          :class="[
            'flex', 'w-full', 'flex-col', 'gap-2',
            'overflow-hidden', 'rounded-2xl', 'p-3',
            'bg-primary-300/10', 'border-2', 'border-solid', 'border-primary-400/70',
          ]"
        >
          <div :class="['flex', 'items-center', 'gap-2']">
            <div class="i-solar:videocamera-record-line-duotone" />
            <div>Capturing</div>
          </div>
          <div :class="['flex', 'w-full', 'items-center', 'gap-3', 'overflow-x-auto']">
            <div
              v-for="stream in activeStreams" :key="stream.id"
              :class="['relative', 'overflow-hidden', 'rounded-lg']"
            >
              <div
                :class="[
                  'absolute', 'right-0', 'top-0', 'z-10',
                  'flex', 'h-full', 'w-full', 'cursor-pointer', 'flex-col',
                  'items-center', 'justify-center', 'gap-1', 'rounded-lg',
                  'bg-black/30', 'text-light', 'opacity-0', 'backdrop-blur-sm',
                  'transition-all', 'duration-200', 'hover:opacity-100',
                ]"
                @click="stopStream(stream)"
              >
                <div class="i-solar:stop-line-duotone" />
                <div class="text-sm">
                  Stop
                </div>
              </div>
              <video
                autoplay
                muted
                playsinline
                :srcObject="stream"
                class="h-140px w-auto"
              />
            </div>
          </div>
        </div>

        <div
          :class="[
            'flex', 'w-full', 'flex-col', 'gap-3', 'pb-6',
          ]"
        >
          <div :class="['flex', 'w-full', 'items-center', 'gap-3']">
            <SelectTab
              v-model="sourceCategory"
              size="sm"
              :options="categoryOptions.map(option => ({
                ...option,
                label: `${option.label} (${sourceCounts[option.value as SourceCategory]})`,
              }))"
              :class="['flex-1']"
            />
            <Button
              :label="refetchLabel"
              :icon="refetchIcon"
              size="sm"
              :disabled="isRefetching"
              :class="['shrink-0']"
              @click="refetchSources()"
            />
          </div>

          <div
            v-if="isInitialLoading"
            :class="[
              'flex', 'w-full', 'items-center', 'justify-center',
              'rounded-2xl',
              'border-2', 'border-dashed', 'border-neutral-200/70', 'dark:border-neutral-800/40',
              'px-4', 'py-12',
              'text-sm', 'text-neutral-500',
            ]"
          >
            <div :class="['flex', 'items-center', 'gap-2']">
              <div class="i-svg-spinners:ring-resize text-lg" />
              <span>Loading sources...</span>
            </div>
          </div>

          <div
            v-else
            :class="[
              'grid', 'gap-3',
              'grid-cols-1', 'md:grid-cols-2', 'xl:grid-cols-4', '3xl:grid-cols-5',
            ]"
          >
            <div
              v-for="source in filteredSources"
              :key="source.id"
              :class="[
                'group', 'flex', 'w-full', 'flex-col', 'gap-3',
                'rounded-2xl', 'bg-white/60', 'dark:bg-neutral-950/40',
                'transition-all', 'duration-200',
              ]"
            >
              <div
                :class="[
                  'relative', 'aspect-video', 'w-full', 'overflow-hidden', 'rounded-2xl',
                  'bg-neutral-100', 'dark:bg-neutral-800',
                  'outline-0', 'outline-offset-2',
                  'group-hover:outline-2', 'group-hover:outline-neutral-100', 'dark:group-hover:outline-neutral-800',
                  'group-focus-within:outline-2', 'group-focus-within:outline-neutral-100', 'dark:group-focus-within:outline-neutral-800',
                ]"
              >
                <div
                  :class="[
                    'absolute', 'inset-0', 'z-10',
                    'flex', 'items-center', 'justify-center',
                    'opacity-0', 'backdrop-blur-sm',
                    'transition-all', 'duration-200',
                    'bg-black/30', 'group-hover:opacity-100',
                  ]"
                >
                  <button
                    type="button"
                    :class="[
                      'flex', 'items-center', 'gap-2', 'rounded-lg', 'px-3', 'py-2',
                      'bg-primary-500/80', 'text-white', 'shadow-lg',
                      'transition-transform', 'duration-200', 'hover:scale-105',
                    ]"
                    @click.stop="startCapture(source)"
                  >
                    <span class="i-solar:share-line-duotone" />
                    <span class="text-sm font-medium">{{ getShareLabel(source) }}</span>
                  </button>
                </div>

                <img
                  v-if="source.thumbnailURL"
                  :src="source.thumbnailURL"
                  alt="Thumbnail"
                  class="h-full w-full object-contain"
                >
                <div
                  v-else
                  class="i-solar:forbidden-circle-line-duotone absolute inset-0 m-auto h-10 w-10 bg-light"
                />
              </div>

              <div :class="['flex', 'w-full', 'flex-col', 'items-start', 'gap-1', 'px-3', 'pb-3']">
                <div :class="['flex', 'items-start', 'gap-2']">
                  <div :class="['h-20px', 'w-20px', 'self-start', 'flex-shrink-0']">
                    <img
                      v-if="source.appIconURL"
                      :src="source.appIconURL"
                      :alt="source.id.startsWith('screen:') ? 'Screen Icon' : 'Window Icon'"
                      class="h-full w-full shrink-0"
                    >
                    <div
                      v-else-if="source.id.startsWith('screen:')"
                      class="i-solar:screencast-2-line-duotone h-full w-full"
                    />
                    <div
                      v-else
                      class="i-solar:window-frame-line-duotone h-full w-full"
                    />
                  </div>

                  <div class="text-sm text-neutral-700 leading-snug dark:text-neutral-200">
                    {{ source.name }}
                  </div>
                </div>

                <div class="text-xs text-neutral-400 font-mono dark:text-neutral-600">
                  {{ source.id }}
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="filteredSources.length === 0"
            :class="[
              'flex', 'w-full', 'flex-col', 'items-center', 'justify-center', 'gap-2',
              'rounded-2xl', 'border-2', 'border-dashed', 'border-neutral-200/70',
              'px-4', 'py-10', 'text-sm', 'text-neutral-500', 'dark:border-neutral-800/40',
            ]"
          >
            <div class="i-solar:shield-warning-line-duotone text-2xl" />
            <div>No sources found for this category.</div>
            <div class="text-xs text-neutral-400">
              Try switching tabs or refetching the sources.
            </div>
          </div>
        </div>
      </div>
      <div
        v-else
        :class="[
          'flex', 'h-full', 'flex-col', 'items-center', 'justify-center', 'gap-4', 'p-6',
        ]"
      >
        <div>
          {{ t('tamagotchi.settings.screen-capture.permissions-prompt.description') }}
        </div>
        <Button @click="requestPermission()">
          {{ t('tamagotchi.settings.screen-capture.permissions-prompt.open-preferences') }}
        </Button>
      </div>
    </template>
  </WithScreenCapture>
</template>

<route lang="yaml">
meta:
  layout: settings
  title: Screen Capture
  subtitleKey: tamagotchi.settings.devtools.title
</route>
