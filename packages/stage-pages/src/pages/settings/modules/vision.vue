<script setup lang="ts">
import type { VisionProviderWithExtraOptions } from '@xsai-ext/shared-providers'

import {
  Button,
  ErrorContainer,
  RadioCardManySelect,
  RadioCardSimple,
  TestDummyMarker,
} from '@proj-airi/stage-ui/components'
import { useVisionStore } from '@proj-airi/stage-ui/stores/modules/vision'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import {
  FieldCheckbox,
  FieldInput,
} from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const providersStore = useProvidersStore()
const visionStore = useVisionStore()
const { configuredVisionProvidersMetadata } = storeToRefs(providersStore)
const {
  activeVisionProvider,
  activeVisionModel,
  enableCameraCapture,
  autoAnalyzeOnCapture,
  supportsModelListing,
  providerModels,
  visionModelSearchQuery,
  activeProviderModelError,
  configured,
} = storeToRefs(visionStore)

// Test state
const capturedImage = ref<string>('')
const analysisResult = ref<string>('')
const testPrompt = ref('Describe this image in detail.')
const isAnalyzing = ref(false)
const isCapturing = ref(false)
const stream = ref<MediaStream | null>(null)
const isScreenSharing = ref(false)

// Video elements
const videoRef = ref<HTMLVideoElement>()
const canvasRef = ref<HTMLCanvasElement>()

// Capture functions
async function startCameraCapture() {
  try {
    if (!enableCameraCapture.value)
      return

    const mediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    })

    stream.value = mediaStream
    if (videoRef.value) {
      videoRef.value.srcObject = mediaStream
    }
    isCapturing.value = true
  }
  catch (error) {
    console.error('Error accessing camera:', error)
    analysisResult.value = `Error accessing camera: ${error.message}`
  }
}

function stopCapture() {
  if (stream.value) {
    stream.value.getTracks().forEach(track => track.stop())
    stream.value = null
  }
  if (videoRef.value) {
    videoRef.value.srcObject = null
  }
  isCapturing.value = false
  isScreenSharing.value = false
}

function captureFrame() {
  if (!videoRef.value || !canvasRef.value)
    return

  const video = videoRef.value
  const canvas = canvasRef.value
  const context = canvas.getContext('2d')

  if (context) {
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    context.drawImage(video, 0, 0, canvas.width, canvas.height)

    capturedImage.value = canvas.toDataURL('image/jpeg', 0.95)

    if (autoAnalyzeOnCapture.value) {
      analyzeImage()
    }
  }
}

// Image analysis
async function analyzeImage() {
  if (!capturedImage.value) {
    analysisResult.value = 'Please capture an image first.'
    return
  }

  if (!configured.value) {
    analysisResult.value = 'Please configure vision provider first.'
    return
  }

  try {
    isAnalyzing.value = true
    analysisResult.value = ''

    const options: VisionProviderWithExtraOptions = {}
    const result = await visionStore.analyzeImageDirect(capturedImage.value, testPrompt.value, options)

    analysisResult.value = result.content
  }
  catch (error) {
    analysisResult.value = `Analysis failed: ${error.message}`
  }
  finally {
    isAnalyzing.value = false
  }
}

// File upload
function handleFileUpload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file)
    return

  const reader = new FileReader()
  reader.onload = (e) => {
    capturedImage.value = e.target?.result as string
    if (autoAnalyzeOnCapture.value) {
      analyzeImage()
    }
  }
  reader.readAsDataURL(file)
}

// Lifecycle
onMounted(async () => {
  if (activeVisionProvider.value) {
    await visionStore.loadModelsForProvider(activeVisionProvider.value)
  }
})

// Watch for provider changes
watch(activeVisionProvider, async (newProvider) => {
  if (newProvider) {
    await visionStore.loadModelsForProvider(newProvider)
  }
})
</script>

<template>
  <div flex="~ col md:row gap-6">
    <div bg="neutral-100 dark:[rgba(0,0,0,0.3)]" rounded-xl p-4 flex="~ col gap-4" class="h-fit w-full md:w-[60%]">
      <div flex="~ col gap-4">
        <!-- Vision Provider Selection -->
        <div>
          <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-400">
            {{ t('settings.pages.providers.title') }}
          </h2>
          <div text="neutral-400 dark:neutral-400">
            <span>{{ t('settings.pages.modules.vision.sections.section.provider-selection.description') }}</span>
          </div>
        </div>

        <div max-w-full>
          <fieldset
            v-if="configuredVisionProvidersMetadata.length > 0"
            flex="~ row gap-4"
            :style="{ 'scrollbar-width': 'none' }"
            min-w-0 of-x-scroll scroll-smooth
            role="radiogroup"
          >
            <RadioCardSimple
              v-for="metadata in configuredVisionProvidersMetadata"
              :key="metadata.id"
              v-model="activeVisionProvider"
              name="provider"
              :value="metadata.id"
              :title="metadata.localizedName || 'Unknown'"
              :description="metadata.localizedDescription"
              :icon="metadata.icon"
              :icon-color="metadata.iconColor"
            />
          </fieldset>
          <div v-else>
            <RouterLink
              class="flex items-center gap-3 rounded-lg p-4"
              border="2 dashed neutral-200 dark:neutral-800"
              bg="neutral-50 dark:neutral-800"
              transition="colors duration-200 ease-in-out"
              to="/settings/providers"
            >
              <div i-solar:warning-circle-line-duotone class="text-2xl text-amber-500 dark:text-amber-400" />
              <div class="flex flex-col">
                <span class="font-medium">No Providers Configured</span>
                <span class="text-sm text-neutral-400 dark:text-neutral-500">Click here to set up your Vision providers</span>
              </div>
              <div i-solar:arrow-right-line-duotone class="ml-auto text-xl text-neutral-400 dark:text-neutral-500" />
            </RouterLink>
          </div>
        </div>

        <!-- Model selection section -->
        <div v-if="activeVisionProvider && supportsModelListing">
          <div flex="~ col gap-4">
            <div>
              <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-400">
                {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.title') }}
              </h2>
              <div text="neutral-400 dark:neutral-400">
                <span>{{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.subtitle') }}</span>
              </div>
            </div>

            <RadioCardManySelect
              v-if="providerModels.length > 0"
              v-model="activeVisionModel"
              v-model:search-query="visionModelSearchQuery"
              :items="providerModels.sort((a, b) => a.id === activeVisionModel ? -1 : b.id === activeVisionModel ? 1 : 0)"
              :searchable="true"
              :search-placeholder="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.search_placeholder')"
              :search-no-results-title="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_search_results')"
              :search-no-results-description="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_search_results_description', { query: visionModelSearchQuery })"
              :search-results-text="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.search_results', { count: '{count}', total: '{total}' })"
              :custom-input-placeholder="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.custom_model_placeholder')"
              :expand-button-text="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.expand')"
              :collapse-button-text="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.collapse')"
            />
            <ErrorContainer
              v-else-if="activeProviderModelError"
              title="Error"
              :error="activeProviderModelError"
            />
          </div>
        </div>

        <!-- Capture Settings -->
        <div class="space-y-4">
          <FieldCheckbox
            v-model="enableCameraCapture"
            :label="t('settings.pages.modules.vision.enable_camera')"
            :description="t('settings.pages.modules.vision.enable_camera_description')"
          />

          <FieldCheckbox
            v-model="autoAnalyzeOnCapture"
            :label="t('settings.pages.modules.vision.auto_analyze')"
            :description="t('settings.pages.modules.vision.auto_analyze_description')"
          />
        </div>
      </div>
    </div>

    <div flex="~ col gap-6" class="w-full md:w-[40%]">
      <div w-full rounded-xl>
        <h2 class="mb-4 text-lg text-neutral-500 md:text-2xl dark:text-neutral-400" w-full>
          <div class="inline-flex items-center gap-4">
            <TestDummyMarker />
            <div>
              {{ t('settings.pages.modules.vision.test_platform.title') }}
            </div>
          </div>
        </h2>

        <!-- Capture Controls -->
        <div class="mb-4 flex gap-2">
          <Button
            v-if="enableCameraCapture && !isCapturing"
            :label="t('settings.pages.modules.vision.actions.start_camera')"
            @click="startCameraCapture"
          />

          <Button
            v-if="isCapturing"
            :label="t('settings.pages.modules.vision.actions.stop_capture')"
            variant="secondary"
            @click="stopCapture"
          />

          <Button
            v-if="isCapturing"
            :label="t('settings.pages.modules.vision.actions.capture_frame')"
            @click="captureFrame"
          />

          <label class="button primary">
            {{ t('settings.pages.modules.vision.actions.upload_image') }}
            <input
              type="file"
              accept="image/*"
              class="hidden"
              @change="handleFileUpload"
            >
          </label>
        </div>

        <!-- Video Preview -->
        <div v-if="isCapturing" class="mb-4 overflow-hidden rounded-lg bg-black">
          <video
            ref="videoRef"
            autoplay
            playsinline
            class="h-auto w-full"
          />
        </div>

        <!-- Hidden Canvas for capture -->
        <canvas ref="canvasRef" class="hidden" />

        <!-- Captured Image -->
        <div v-if="capturedImage" class="mb-4">
          <div class="mb-2 text-sm text-neutral-500 dark:text-neutral-400">
            {{ t('settings.pages.modules.vision.captured_image') }}
          </div>
          <img
            :src="capturedImage"
            alt="Captured"
            class="h-auto max-w-full border border-neutral-200 rounded-lg dark:border-neutral-700"
          >
        </div>

        <!-- Analysis Prompt -->
        <div class="mb-4">
          <FieldInput
            v-model="testPrompt"
            type="textarea"
            :label="t('settings.pages.modules.vision.prompt_label')"
            :placeholder="t('settings.pages.modules.vision.prompt_placeholder')"
            :rows="3"
          />
        </div>

        <!-- Analyze Button -->
        <div class="mb-4">
          <Button
            :label="t('settings.pages.modules.vision.actions.analyze')"
            :disabled="!capturedImage || isAnalyzing || !configured"
            @click="analyzeImage"
          />

          <div v-if="isAnalyzing" class="ml-2 inline-flex items-center">
            <div class="i-solar:spinner-line-duotone animate-spin" />
            <span class="ml-2">{{ t('settings.pages.modules.vision.analyzing') }}</span>
          </div>
        </div>

        <!-- Analysis Result -->
        <div v-if="analysisResult" class="border border-neutral-200 rounded-lg bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800">
          <div class="mb-2 text-sm text-neutral-700 font-medium dark:text-neutral-300">
            {{ t('settings.pages.modules.vision.analysis_result') }}
          </div>
          <div class="whitespace-pre-wrap text-sm text-neutral-600 dark:text-neutral-400">
            {{ analysisResult }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
