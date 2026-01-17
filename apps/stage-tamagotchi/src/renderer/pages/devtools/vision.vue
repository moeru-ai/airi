<script setup lang="ts">
import type { VisionWorkloadId } from '@proj-airi/stage-ui/composables'
import type { SourcesOptions } from 'electron'

import { errorMessageFrom } from '@moeru/std'
import { ProcessingMeter } from '@proj-airi/stage-ui/components'
import { VISION_WORKLOADS } from '@proj-airi/stage-ui/composables'
import { useVisionOrchestratorStore, useVisionProcessingStore, useVisionStore } from '@proj-airi/stage-ui/stores/modules/vision'
import { Button, FieldCheckbox, FieldRange, FieldSelect, SelectTab } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, ref } from 'vue'

import WithScreenCapture from '../../components/WithScreenCapture.vue'

import { useVisionScreenCapture } from '../../composables/use-vision-screen-capture'

type SourceCategory = 'applications' | 'displays' | 'devices'

const visionStore = useVisionStore()
const visionProcessingStore = useVisionProcessingStore()
const visionOrchestratorStore = useVisionOrchestratorStore()
const { activeModel } = storeToRefs(visionStore)
const {
  captureIntervalMs,
  isRunning,
  isProcessing,
  captureCount,
  contextUpdateCount,
  lastProcessingDurationMs,
  captureRatePerMinute,
  contextUpdateRatePerMinute,
  processingHistoryMs,
} = storeToRefs(visionProcessingStore)
const {
  lastResultText,
  lastResultAt,
  lastError,
} = storeToRefs(visionOrchestratorStore)

const sourcesOptions = ref<SourcesOptions>({
  types: ['screen', 'window'],
  fetchWindowIcons: true,
})

const sourceCategory = ref<SourceCategory>('displays')
const errorMessage = ref('')
const screenshotDataUrl = ref('')
const sendContextUpdates = ref(false)
const selectedWorkload = ref<VisionWorkloadId>(VISION_WORKLOADS[0]?.id || 'screen:interpret')

const videoRef = ref<HTMLVideoElement | null>(null)

const {
  sources,
  activeSourceId,
  activeSource,
  activeStream,
  isRefetching,
  hasFetchedOnce,
  refetchSources,
  startStream,
  stopStream,
  cleanup,
  captureFrame,
} = useVisionScreenCapture(sourcesOptions)

const categoryOptions = [
  { label: 'Applications', value: 'applications', icon: 'i-solar:window-frame-line-duotone' },
  { label: 'Displays', value: 'displays', icon: 'i-solar:screencast-2-line-duotone' },
  { label: 'Devices', value: 'devices', icon: 'i-solar:smartphone-2-line-duotone' },
]

const workloadOptions = VISION_WORKLOADS.map(workload => ({
  label: workload.label,
  value: workload.id,
}))

const isDisplaySource = (source: { id: string }) => source.id.startsWith('screen:')
const isWindowSource = (source: { id: string }) => source.id.startsWith('window:')
const isDeviceSource = (source: { id: string }) => source.id.startsWith('device:')

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

const statusLabel = computed(() => {
  if (isRunning.value)
    return isProcessing.value ? 'Processing...' : 'Streaming'
  return activeStream.value ? 'Ready' : 'Idle'
})

const isInitialLoading = computed(() => !hasFetchedOnce.value && isRefetching.value)
const refetchLabel = computed(() => (isInitialLoading.value ? 'Loading...' : isRefetching.value ? 'Refetching...' : 'Refetch'))

const processingMaxMs = computed(() => {
  if (!processingHistoryMs.value.length)
    return 500
  return Math.max(500, ...processingHistoryMs.value)
})

const expectedRateMax = computed(() => {
  const interval = Math.max(250, captureIntervalMs.value)
  return Math.max(60, Math.ceil(60000 / interval))
})

async function ensureVideoStream() {
  if (!activeSourceId.value)
    return

  const stream = await startStream()
  const video = videoRef.value
  if (!video)
    return

  video.srcObject = stream
  await video.play()

  await new Promise<void>((resolve) => {
    if (video.readyState >= 2) {
      resolve()
      return
    }
    video.onloadedmetadata = () => resolve()
  })
}

async function handleVisionTick() {
  if (!activeSourceId.value)
    return

  try {
    if (!activeStream.value)
      await ensureVideoStream()

    const video = videoRef.value
    if (!video)
      return

    const dataUrl = captureFrame(video)
    if (!dataUrl)
      return

    screenshotDataUrl.value = dataUrl
    const capturedAt = Date.now()

    const result = await visionOrchestratorStore.processCapture({
      imageDataUrl: dataUrl,
      workloadId: selectedWorkload.value,
      sourceId: activeSourceId.value,
      capturedAt,
      publishContext: sendContextUpdates.value,
    })

    return { capturedAt, contextUpdates: result.contextUpdates }
  }
  catch (error) {
    visionOrchestratorStore.recordError(error)
    errorMessage.value = `Failed to interpret frame: ${errorMessageFrom(error)}`
    return { capturedAt: Date.now(), contextUpdates: 0 }
  }
}

async function startCaptureLoop() {
  errorMessage.value = ''
  if (!activeSourceId.value) {
    errorMessage.value = 'Select a screen source before starting the ticker.'
    return
  }

  try {
    await ensureVideoStream()
  }
  catch (error) {
    errorMessage.value = `Failed to start stream: ${errorMessageFrom(error)}`
    return
  }

  visionProcessingStore.startTicker(handleVisionTick)
}

async function stopCaptureLoop() {
  visionProcessingStore.stopTicker()
  stopStream()
  if (videoRef.value) {
    videoRef.value.pause()
    videoRef.value.srcObject = null
  }
}

function selectSource(sourceId: string) {
  activeSourceId.value = sourceId
  if (isRunning.value) {
    void ensureVideoStream().catch((error) => {
      errorMessage.value = `Failed to start stream: ${errorMessageFrom(error)}`
    })
  }
}

onBeforeUnmount(() => {
  visionProcessingStore.stopTicker()
  stopStream()
  cleanup()
})
</script>

<template>
  <WithScreenCapture :sources-options="sourcesOptions">
    <template #default="{ hasPermissions, requestPermission }">
      <div
        v-if="hasPermissions"
        :class="['flex', 'flex-col', 'gap-6']"
      >
        <div v-if="!hasFetchedOnce && !isRefetching" :class="['hidden']">
          {{ refetchSources() }}
        </div>

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

        <div :class="['grid', 'gap-4', 'md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]']">
          <div :class="['flex', 'flex-col', 'gap-4']">
            <div :class="['rounded-xl', 'bg-neutral-100', 'p-4', 'dark:bg-[rgba(0,0,0,0.3)]']">
              <div :class="['flex', 'flex-col', 'gap-4']">
                <div :class="['flex', 'items-center', 'gap-3']">
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
                    icon="i-solar:refresh-line-duotone"
                    size="sm"
                    :disabled="isRefetching"
                    @click="refetchSources()"
                  />
                </div>

                <div
                  v-if="isInitialLoading"
                  :class="[
                    'flex', 'w-full', 'items-center', 'justify-center',
                    'rounded-xl',
                    'border-2', 'border-dashed', 'border-neutral-200/70', 'dark:border-neutral-800/40',
                    'px-4', 'py-10',
                    'text-sm', 'text-neutral-500',
                  ]"
                >
                  <div :class="['flex', 'items-center', 'gap-2']">
                    <div :class="['i-svg-spinners:ring-resize', 'text-lg']" />
                    <span>Loading sources...</span>
                  </div>
                </div>

                <div
                  v-else
                  :class="[
                    'grid', 'gap-3',
                    'grid-cols-1', 'md:grid-cols-2', 'xl:grid-cols-3',
                  ]"
                >
                  <button
                    v-for="source in filteredSources"
                    :key="source.id"
                    type="button"
                    :class="[
                      'flex', 'w-full', 'flex-col', 'gap-2', 'rounded-xl', 'p-3', 'text-left',
                      'border', 'border-transparent',
                      'bg-white/60', 'dark:bg-neutral-900/40',
                      'transition', 'duration-200',
                      activeSourceId === source.id
                        ? 'border-primary-400/70 shadow-sm'
                        : 'hover:border-neutral-200 dark:hover:border-neutral-700',
                    ]"
                    @click="selectSource(source.id)"
                  >
                    <div :class="['relative', 'aspect-video', 'w-full', 'overflow-hidden', 'rounded-lg', 'bg-neutral-200/60', 'dark:bg-neutral-800']">
                      <img
                        v-if="source.thumbnailURL"
                        :src="source.thumbnailURL"
                        alt="Source preview"
                        :class="['h-full', 'w-full', 'object-contain']"
                      >
                      <div
                        v-else
                        :class="[
                          'absolute', 'inset-0', 'flex', 'items-center', 'justify-center',
                          'text-2xl', 'text-neutral-400', 'i-solar:screen-share-line-duotone',
                        ]"
                      />
                    </div>
                    <div :class="['flex', 'items-center', 'gap-2']">
                      <div :class="['h-5', 'w-5']">
                        <img v-if="source.appIconURL" :src="source.appIconURL" alt="Source icon" :class="['h-full', 'w-full']">
                        <div v-else :class="['i-solar:window-frame-line-duotone', 'h-full', 'w-full']" />
                      </div>
                      <div :class="['text-sm', 'text-neutral-700', 'dark:text-neutral-200', 'line-clamp-1']">
                        {{ source.name }}
                      </div>
                    </div>
                    <div :class="['text-xs', 'text-neutral-400', 'font-mono', 'line-clamp-1']">
                      {{ source.id }}
                    </div>
                  </button>
                </div>

                <div
                  v-if="filteredSources.length === 0 && !isInitialLoading"
                  :class="[
                    'flex', 'flex-col', 'items-center', 'justify-center', 'gap-2',
                    'rounded-xl', 'border-2', 'border-dashed', 'border-neutral-200/70',
                    'px-4', 'py-10', 'text-sm', 'text-neutral-500', 'dark:border-neutral-800/40',
                  ]"
                >
                  <div :class="['i-solar:shield-warning-line-duotone', 'text-2xl']" />
                  <div>No sources found for this category.</div>
                  <div :class="['text-xs', 'text-neutral-400']">
                    Try switching tabs or refetching the sources.
                  </div>
                </div>
              </div>
            </div>

            <div :class="['rounded-xl', 'bg-neutral-100', 'p-4', 'dark:bg-[rgba(0,0,0,0.3)]']">
              <div :class="['flex', 'flex-col', 'gap-4']">
                <div :class="['flex', 'items-center', 'justify-between']">
                  <div :class="['text-sm', 'uppercase', 'tracking-wide', 'text-neutral-400']">
                    Ticker controls
                  </div>
                  <div :class="['text-xs', 'text-neutral-400']">
                    {{ statusLabel }}
                  </div>
                </div>

                <FieldRange
                  v-model="captureIntervalMs"
                  label="Capture interval"
                  description="How frequently the vision loop grabs a frame."
                  :min="500"
                  :max="15000"
                  :step="250"
                  :format-value="value => `${(value / 1000).toFixed(2)}s`"
                />

                <FieldSelect
                  v-model="selectedWorkload"
                  label="Vision workload"
                  description="Select how the model should interpret the screen."
                  :options="workloadOptions"
                />

                <div :class="['flex', 'items-center', 'gap-3']">
                  <Button
                    :label="isRunning ? 'Stop ticker' : 'Start ticker'"
                    :icon="isRunning ? 'i-solar:stop-line-duotone' : 'i-solar:play-line-duotone'"
                    :disabled="!activeSourceId"
                    @click="isRunning ? stopCaptureLoop() : startCaptureLoop()"
                  />
                  <div :class="['text-xs', 'text-neutral-400']">
                    {{ activeSource ? `Source: ${activeSource.name}` : 'Pick a source to begin.' }}
                  </div>
                </div>

                <div :class="['grid', 'gap-4', 'md:grid-cols-2']">
                  <FieldCheckbox
                    v-model="sendContextUpdates"
                    label="Publish to character"
                    description="Send interpreted results as context updates."
                  />
                </div>
              </div>
            </div>
          </div>

          <div :class="['flex', 'flex-col', 'gap-4']">
            <ProcessingMeter
              title="Vision telemetry"
              :processing-history="processingHistoryMs"
              :processing-value="lastProcessingDurationMs ?? 0"
              processing-label="Inference latency"
              processing-unit="ms"
              :processing-max="processingMaxMs"
              :rate-value="contextUpdateRatePerMinute"
              :rate-max="expectedRateMax"
              rate-label="Context updates"
              rate-unit="/min"
              :secondary-rate-value="captureRatePerMinute"
              :secondary-rate-max="expectedRateMax"
              secondary-rate-label="Capture rate"
              secondary-rate-unit="/min"
            />

            <div :class="['rounded-xl', 'bg-neutral-100', 'p-4', 'dark:bg-[rgba(0,0,0,0.3)]']">
              <div :class="['flex', 'items-center', 'justify-between', 'text-xs', 'uppercase', 'tracking-wide', 'text-neutral-400']">
                <span>Snapshot</span>
                <span>{{ captureCount }} captures · {{ contextUpdateCount }} context updates</span>
              </div>
              <div
                v-if="screenshotDataUrl"
                :class="['mt-3', 'flex', 'flex-col', 'gap-3']"
              >
                <img :src="screenshotDataUrl" alt="Captured screen" :class="['w-full', 'rounded-lg', 'object-contain']">
                <textarea
                  :value="screenshotDataUrl"
                  readonly
                  :class="[
                    'h-32',
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
              <div v-else :class="['mt-4', 'text-sm', 'text-neutral-400']">
                No frames captured yet. Start the ticker to preview snapshots.
              </div>
            </div>

            <div :class="['rounded-xl', 'bg-neutral-100', 'p-4', 'dark:bg-[rgba(0,0,0,0.3)]']">
              <div :class="['flex', 'items-center', 'justify-between', 'text-xs', 'uppercase', 'tracking-wide', 'text-neutral-400']">
                <span>Last interpretation</span>
                <span>{{ lastResultAt ? new Date(lastResultAt).toLocaleTimeString() : 'Idle' }}</span>
              </div>
              <div :class="['mt-3', 'text-sm', 'text-neutral-600', 'dark:text-neutral-200', 'whitespace-pre-wrap']">
                {{ lastResultText || 'No vision output yet.' }}
              </div>
              <div v-if="lastError" :class="['mt-3', 'text-xs', 'text-amber-500']">
                {{ lastError }}
              </div>
            </div>

            <div
              v-if="errorMessage"
              :class="[
                'rounded-lg', 'bg-amber-100', 'p-3',
                'text-sm', 'text-amber-700',
                'dark:bg-amber-900/30', 'dark:text-amber-300',
              ]"
            >
              {{ errorMessage }}
            </div>
          </div>
        </div>

        <video ref="videoRef" :class="['hidden']" />
      </div>

      <div
        v-else
        :class="[
          'flex', 'h-full', 'flex-col', 'items-center', 'justify-center', 'gap-4', 'p-6',
        ]"
      >
        <div>
          Screen capture permissions are required to use vision capture.
        </div>
        <Button @click="requestPermission()">
          Open system preferences
        </Button>
      </div>
    </template>
  </WithScreenCapture>
</template>

<route lang="yaml">
meta:
  layout: settings
</route>
