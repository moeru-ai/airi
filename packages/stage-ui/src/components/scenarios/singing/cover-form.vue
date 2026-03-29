<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { useSingingApi } from '../../../composables/use-singing-api'
import { useSingingArtifactsStore } from '../../../stores/modules/singing/artifacts'
import { useSingingCoverStore } from '../../../stores/modules/singing/cover'

interface VoiceModelInfo {
  name: string
  hasIndex: boolean
}

const coverStore = useSingingCoverStore()
const artifactsStore = useSingingArtifactsStore()
const { apiUrl, singingFetch } = useSingingApi()

const inputFile = ref<File | null>(null)
const voiceId = ref('')
const f0UpKey = ref(0)
const indexRate = ref(0.75)
const protect = ref(0.33)
const rmsMixRate = ref(0.25)
const autoCalibrate = ref(true)
const isSubmitting = ref(false)
const submitError = ref<string | null>(null)
const isDragOver = ref(false)
const uploadPhase = ref<'idle' | 'uploading' | 'processing' | 'polling'>('idle')
const availableModels = ref<VoiceModelInfo[]>([])
const modelsLoading = ref(false)

const canSubmit = computed(() => inputFile.value !== null && voiceId.value !== '' && !isSubmitting.value && !coverStore.isRunning)

async function fetchVoiceModels() {
  modelsLoading.value = true
  try {
    const res = await singingFetch('/models')
    if (res.ok) {
      const data = await res.json() as { voiceModels?: VoiceModelInfo[] }
      availableModels.value = data.voiceModels ?? []
      if (availableModels.value.length > 0 && !voiceId.value) {
        voiceId.value = availableModels.value[0].name
      }
    }
  }
  catch { /* silently fail */ }
  finally {
    modelsLoading.value = false
  }
}

onMounted(fetchVoiceModels)

const fileSizeDisplay = computed(() => {
  if (!inputFile.value)
    return ''
  const bytes = inputFile.value.size
  if (bytes < 1024)
    return `${bytes} B`
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
})

function handleFileDrop(e: DragEvent) {
  isDragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file && (file.type.startsWith('audio/') || file.type.startsWith('video/'))) {
    inputFile.value = file
  }
}

function handleFileSelect(e: Event) {
  inputFile.value = (e.target as HTMLInputElement).files?.[0] ?? null
}

function removeFile() {
  inputFile.value = null
}

async function handleSubmit() {
  if (!inputFile.value)
    return

  isSubmitting.value = true
  submitError.value = null
  uploadPhase.value = 'uploading'
  coverStore.reset()
  artifactsStore.reset()

  try {
    const params: Record<string, any> = {
      mode: 'rvc' as const,
      separator: { backend: 'melband' as const },
      pitch: { backend: 'rmvpe' as const },
      converter: {
        backend: 'rvc' as const,
        voiceId: voiceId.value,
        f0UpKey: f0UpKey.value,
        indexRate: indexRate.value,
        protect: protect.value,
        rmsMixRate: rmsMixRate.value,
      },
      autoCalibrate: autoCalibrate.value,
    }

    const formData = new FormData()
    formData.append('file', inputFile.value)
    formData.append('params', JSON.stringify(params))

    uploadPhase.value = 'processing'

    const response = await singingFetch('/cover', {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: response.statusText }))
      throw new Error(err.message || err.error || `Request failed: ${response.status}`)
    }

    const data = await response.json() as { jobId: string, status: string }
    coverStore.currentJobId = data.jobId
    coverStore.status = data.status
    uploadPhase.value = 'polling'

    pollJobStatus(data.jobId)
  }
  catch (err) {
    submitError.value = err instanceof Error ? err.message : String(err)
    coverStore.status = 'failed'
    coverStore.error = submitError.value
    uploadPhase.value = 'idle'
  }
  finally {
    isSubmitting.value = false
  }
}

async function pollJobStatus(jobId: string) {
  coverStore.status = 'running'

  const poll = async () => {
    try {
      const res = await singingFetch(`/jobs/${jobId}`)
      if (!res.ok)
        return

      const data = await res.json() as {
        job: { status: string, currentStage: string | null, error?: string }
      }

      coverStore.status = data.job.status
      coverStore.currentStage = data.job.currentStage

      const stageProgressMap: Record<string, number> = {
        prepare_source: 11,
        separate_vocals: 22,
        extract_f0: 33,
        auto_calibrate: 40,
        convert_vocals: 50,
        postprocess_vocals: 62,
        remix: 74,
        evaluate: 85,
        finalize: 95,
      }
      if (data.job.currentStage && stageProgressMap[data.job.currentStage]) {
        coverStore.progress = stageProgressMap[data.job.currentStage]
      }

      if (data.job.status === 'completed') {
        coverStore.progress = 100
        uploadPhase.value = 'idle'
        const base = apiUrl(`/artifacts/${jobId}`)
        artifactsStore.finalCoverUrl = `${base}/05_mix/final_cover.wav`
        artifactsStore.vocalsUrl = `${base}/02_separate/vocals.wav`
        artifactsStore.instrumentalUrl = `${base}/02_separate/instrumental.wav`
        artifactsStore.convertedVocalsUrl = `${base}/04_convert/converted_vocals.wav`
        return
      }

      if (data.job.status === 'failed') {
        coverStore.error = data.job.error ?? 'Unknown error'
        uploadPhase.value = 'idle'
        return
      }

      setTimeout(poll, 2000)
    }
    catch {
      setTimeout(poll, 5000)
    }
  }

  poll()
}
</script>

<template>
  <form class="flex flex-col gap-4" @submit.prevent="handleSubmit">
    <!-- File Upload Zone -->
    <div>
      <label class="mb-1 block text-sm text-neutral-700 font-medium dark:text-neutral-300">Input Audio</label>
      <div
        v-if="!inputFile"
        class="cursor-pointer border-2 rounded-xl p-6 text-center transition-all duration-200"
        :class="isDragOver
          ? 'border-primary-400 bg-primary-50 dark:border-primary-500 dark:bg-primary-900/20'
          : 'border-neutral-300 border-dashed bg-neutral-50 hover:border-primary-300 dark:border-neutral-600 dark:bg-neutral-800/50 dark:hover:border-primary-600'"
        @dragover.prevent="isDragOver = true"
        @dragleave="isDragOver = false"
        @drop.prevent="handleFileDrop"
        @click="($refs.fileInput as HTMLInputElement)?.click()"
      >
        <div class="flex flex-col items-center gap-2">
          <div class="text-3xl text-neutral-400 dark:text-neutral-500" :class="isDragOver ? 'i-solar:upload-bold-duotone text-primary-500' : 'i-solar:music-notes-bold-duotone'" />
          <div class="text-sm text-neutral-500 dark:text-neutral-400">
            {{ isDragOver ? 'Drop file here' : 'Click or drag audio file here' }}
          </div>
          <div class="text-xs text-neutral-400 dark:text-neutral-500">
            Supports MP3, WAV, FLAC, OGG, and video files
          </div>
        </div>
      </div>
      <input ref="fileInput" type="file" accept="audio/*,video/*" class="hidden" @change="handleFileSelect">

      <!-- File Preview -->
      <div
        v-if="inputFile"
        class="flex items-center gap-3 border border-green-200 rounded-xl bg-green-50 p-3 dark:border-green-800 dark:bg-green-900/20"
      >
        <div class="i-solar:music-note-slider-bold-duotone text-xl text-green-600 dark:text-green-400" />
        <div class="min-w-0 flex-1">
          <div class="truncate text-sm text-neutral-800 font-medium dark:text-neutral-200">
            {{ inputFile.name }}
          </div>
          <div class="text-xs text-neutral-500">
            {{ fileSizeDisplay }}
          </div>
        </div>
        <button
          type="button"
          class="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-200 dark:hover:bg-neutral-700"
          @click="removeFile"
        >
          <div class="i-solar:close-circle-bold-duotone text-lg" />
        </button>
      </div>
    </div>

    <!-- Voice Model -->
    <div>
      <div class="mb-1 flex items-center justify-between">
        <label class="text-sm text-neutral-700 font-medium dark:text-neutral-300">Voice Model</label>
        <button
          type="button"
          class="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
          :disabled="modelsLoading"
          @click="fetchVoiceModels"
        >
          <div class="text-xs" :class="modelsLoading ? 'i-svg-spinners:ring-resize' : 'i-solar:refresh-bold-duotone'" />
          <span>Refresh</span>
        </button>
      </div>

      <div v-if="modelsLoading" class="flex items-center gap-2 border border-neutral-300 rounded-lg px-3 py-2 text-xs text-neutral-400 dark:border-neutral-600 dark:bg-neutral-800">
        <div class="i-svg-spinners:ring-resize" /><span>Detecting voice models...</span>
      </div>

      <select
        v-else-if="availableModels.length > 0"
        v-model="voiceId"
        class="w-full border border-neutral-300 rounded-lg bg-white px-3 py-2 text-sm outline-none transition-colors dark:border-neutral-600 focus:border-primary-400 dark:bg-neutral-800 dark:focus:border-primary-500"
      >
        <option v-for="vm in availableModels" :key="vm.name" :value="vm.name">
          {{ vm.name }}{{ vm.hasIndex ? ' (indexed)' : '' }}
        </option>
      </select>

      <div v-else class="border border-amber-200 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
        No voice models found. Train a model first or place <code class="rounded bg-amber-100 px-1 py-0.5 dark:bg-amber-800/50">.pth</code> files in the models directory.
      </div>
    </div>

    <!-- Auto-Calibrate Toggle -->
    <div class="flex items-center justify-between border border-neutral-200 rounded-lg px-3 py-2.5 dark:border-neutral-700">
      <div class="flex items-center gap-2">
        <div class="i-solar:magic-stick-3-bold-duotone text-base" :class="autoCalibrate ? 'text-primary-500' : 'text-neutral-400'" />
        <div>
          <div class="text-sm font-medium" :class="autoCalibrate ? 'text-primary-600 dark:text-primary-400' : 'text-neutral-600 dark:text-neutral-400'">
            Auto-Calibrate Parameters
          </div>
          <div class="text-xs text-neutral-400 dark:text-neutral-500">
            {{ autoCalibrate ? 'Parameters will be auto-optimized based on voice profile' : 'Using manual parameters below' }}
          </div>
        </div>
      </div>
      <button
        type="button"
        class="relative h-6 w-11 rounded-full transition-colors duration-200"
        :class="autoCalibrate ? 'bg-primary-500' : 'bg-neutral-300 dark:bg-neutral-600'"
        @click="autoCalibrate = !autoCalibrate"
      >
        <span
          class="absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform duration-200"
          :class="autoCalibrate ? 'left-[22px]' : 'left-0.5'"
        />
      </button>
    </div>

    <!-- Parameters (shown only when auto-calibrate is off) -->
    <details v-if="!autoCalibrate" class="group" open>
      <summary class="cursor-pointer list-none text-sm text-neutral-500 font-medium dark:text-neutral-400">
        <div class="flex items-center gap-1.5">
          <div class="i-solar:settings-bold-duotone text-base" />
          <span>Manual Parameters</span>
          <div class="i-solar:alt-arrow-down-line-duotone text-base transition-transform group-open:rotate-180" />
        </div>
      </summary>
      <div class="grid grid-cols-2 mt-3 gap-3 md:grid-cols-4">
        <div>
          <label class="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">Pitch Shift (semitones)</label>
          <input
            v-model.number="f0UpKey"
            type="number"
            class="w-full border border-neutral-300 rounded-lg bg-white px-2.5 py-1.5 text-sm outline-none transition-colors dark:border-neutral-600 focus:border-primary-400 dark:bg-neutral-800 dark:focus:border-primary-500"
          >
        </div>
        <div>
          <label class="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">Index Rate</label>
          <input
            v-model.number="indexRate"
            type="number"
            step="0.05"
            min="0"
            max="1"
            class="w-full border border-neutral-300 rounded-lg bg-white px-2.5 py-1.5 text-sm outline-none transition-colors dark:border-neutral-600 focus:border-primary-400 dark:bg-neutral-800 dark:focus:border-primary-500"
          >
        </div>
        <div>
          <label class="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">Protect</label>
          <input
            v-model.number="protect"
            type="number"
            step="0.01"
            min="0"
            max="0.5"
            class="w-full border border-neutral-300 rounded-lg bg-white px-2.5 py-1.5 text-sm outline-none transition-colors dark:border-neutral-600 focus:border-primary-400 dark:bg-neutral-800 dark:focus:border-primary-500"
          >
        </div>
        <div>
          <label class="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">RMS Mix Rate</label>
          <input
            v-model.number="rmsMixRate"
            type="number"
            step="0.05"
            min="0"
            max="1"
            class="w-full border border-neutral-300 rounded-lg bg-white px-2.5 py-1.5 text-sm outline-none transition-colors dark:border-neutral-600 focus:border-primary-400 dark:bg-neutral-800 dark:focus:border-primary-500"
          >
        </div>
      </div>
    </details>

    <!-- Upload Status -->
    <div
      v-if="uploadPhase !== 'idle' && !submitError"
      class="flex items-center gap-2 border rounded-lg p-3"
      :class="{
        'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20': uploadPhase === 'uploading' || uploadPhase === 'processing',
        'border-primary-200 bg-primary-50 dark:border-primary-800 dark:bg-primary-900/20': uploadPhase === 'polling',
      }"
    >
      <div class="animate-spin text-sm" :class="uploadPhase === 'polling' ? 'text-primary-500' : 'text-blue-500'">
        <div class="i-solar:spinner-line-duotone text-lg" />
      </div>
      <span class="text-sm font-medium" :class="uploadPhase === 'polling' ? 'text-primary-700 dark:text-primary-400' : 'text-blue-700 dark:text-blue-400'">
        {{ uploadPhase === 'uploading' ? 'Uploading audio file...' : uploadPhase === 'processing' ? 'Submitting job...' : 'Pipeline running, see progress below...' }}
      </span>
    </div>

    <!-- Error -->
    <div v-if="submitError" class="flex items-start gap-2 border border-red-200 rounded-lg bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
      <div class="i-solar:danger-triangle-bold-duotone mt-0.5 text-lg text-red-500" />
      <div class="flex-1">
        <div class="text-sm text-red-700 font-medium dark:text-red-400">
          Submission Failed
        </div>
        <div class="mt-0.5 text-xs text-red-600 dark:text-red-400/80">
          {{ submitError }}
        </div>
      </div>
    </div>

    <!-- Submit -->
    <button
      type="submit"
      :disabled="!canSubmit"
      class="flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm text-white font-medium transition-all duration-200"
      :class="canSubmit
        ? 'bg-primary-500 shadow-sm hover:bg-primary-600 active:scale-[0.98]'
        : 'cursor-not-allowed bg-neutral-300 dark:bg-neutral-700'"
    >
      <div v-if="isSubmitting" class="i-solar:spinner-line-duotone animate-spin text-base" />
      <div v-else-if="coverStore.isRunning" class="i-solar:rewind-forward-bold-duotone text-base" />
      <div v-else class="i-solar:play-circle-bold-duotone text-base" />
      <span>{{ isSubmitting ? 'Uploading...' : coverStore.isRunning ? 'Pipeline Running...' : 'Start Cover' }}</span>
    </button>
  </form>
</template>
