<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref } from 'vue'

import { useSingingApi } from '../../../composables/use-singing-api'
import { useSingingTrainingStore } from '../../../stores/modules/singing/training'

interface ReportCardData {
  overall_grade: string
  singer_similarity: number
  content_score: number
  f0_corr: number
  naturalness_mos: number
  f0_rmse_cents: number
  mcd: number
  worst_samples: Array<{ filename: string, failure_reason: string, score: number }>
  per_bucket_scores: Record<string, { bucket_tag: string, singer_similarity: number, f0_corr: number, naturalness_mos: number }>
}

const trainingStore = useSingingTrainingStore()
const { singingFetch } = useSingingApi()

const voiceId = ref('')
const epochs = ref(200)
const batchSize = ref(8)
const datasetFile = ref<File | null>(null)
const isSubmitting = ref(false)
const submitError = ref<string | null>(null)
const isDragOver = ref(false)

const trainingLogs = ref<string[]>([])
const trainingStartedAt = ref(0)
const elapsed = ref(0)
const reportCard = ref<ReportCardData | null>(null)
let pollTimer: ReturnType<typeof setTimeout> | null = null
let elapsedTimer: ReturnType<typeof setInterval> | null = null

const trainingLogEl = ref<HTMLElement>()

function fileSizeDisplay(file: File) {
  const bytes = file.size
  if (bytes < 1024)
    return `${bytes} B`
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const canSubmit = computed(() =>
  voiceId.value.trim() !== ''
  && datasetFile.value !== null
  && !isSubmitting.value
  && !trainingStore.isTraining,
)

function handleFileDrop(e: DragEvent) {
  isDragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file && (file.type.startsWith('audio/') || file.name.endsWith('.zip')))
    datasetFile.value = file
}

function handleFileSelect(e: Event) {
  datasetFile.value = (e.target as HTMLInputElement).files?.[0] ?? null
}

function removeFile() {
  datasetFile.value = null
}

function formatTime(s: number): string {
  if (s < 60)
    return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60)
    return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

async function handleStartTraining() {
  if (!voiceId.value || !datasetFile.value)
    return

  isSubmitting.value = true
  submitError.value = null
  trainingStore.reset()
  trainingLogs.value = []

  try {
    const formData = new FormData()
    formData.append('file', datasetFile.value)
    formData.append('params', JSON.stringify({
      voiceId: voiceId.value,
      epochs: epochs.value,
      batchSize: batchSize.value,
    }))

    trainingLogs.value.push(`Uploading dataset: ${datasetFile.value.name} (${fileSizeDisplay(datasetFile.value)})...`)

    const response = await singingFetch('/train', {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: response.statusText }))
      throw new Error(err.message || err.error || `Request failed: ${response.status}`)
    }

    const data = await response.json() as { jobId: string, status: string }
    trainingStore.jobId = data.jobId
    trainingStore.status = 'running'
    trainingStore.totalEpochs = epochs.value
    trainingStartedAt.value = Date.now()

    trainingLogs.value.push(`Training job created: ${data.jobId}`)
    trainingLogs.value.push(`Voice ID: ${voiceId.value}`)
    trainingLogs.value.push(`Epochs: ${epochs.value}, Batch Size: ${batchSize.value}`)
    trainingLogs.value.push('Pipeline starting...')

    startPolling(data.jobId)
    startElapsedTimer()
  }
  catch (err) {
    if (err instanceof TypeError && String(err).includes('Failed to fetch')) {
      const sizeMB = datasetFile.value ? (datasetFile.value.size / (1024 * 1024)).toFixed(1) : '?'
      submitError.value = `Network error: upload failed (dataset size: ${sizeMB} MB). `
        + 'Possible causes: file too large for server limit, network timeout, or server not running. '
        + 'Please check the server log and try again.'
    }
    else {
      submitError.value = err instanceof Error ? err.message : String(err)
    }
  }
  finally {
    isSubmitting.value = false
  }
}

function startElapsedTimer() {
  if (elapsedTimer)
    clearInterval(elapsedTimer)
  elapsedTimer = setInterval(() => {
    elapsed.value = Math.round((Date.now() - trainingStartedAt.value) / 1000)
  }, 1000)
}

function startPolling(jobId: string) {
  const poll = async () => {
    try {
      const res = await singingFetch(`/jobs/${jobId}`)
      if (!res.ok)
        return

      const data = await res.json() as {
        job: {
          status: string
          currentStage: string | null
          error?: string
          currentEpoch?: number
          totalEpochs?: number
          lossG?: number
          lossD?: number
          loss?: number
          stageTiming?: Record<string, number>
          trainingPct?: number
          trainingStep?: number
          trainingStepTotal?: number
          trainingStepName?: string
        }
      }

      trainingStore.status = data.job.status

      if (data.job.trainingPct != null)
        trainingStore.trainingPct = data.job.trainingPct
      if (data.job.trainingStep != null)
        trainingStore.trainingStep = data.job.trainingStep
      if (data.job.trainingStepTotal != null)
        trainingStore.trainingStepTotal = data.job.trainingStepTotal

      if (data.job.trainingStepName && data.job.trainingStepName !== trainingStore.trainingStepName) {
        trainingStore.trainingStepName = data.job.trainingStepName
        const stageMsg = `[${data.job.trainingStep}/${data.job.trainingStepTotal}] ${data.job.trainingStepName}`
        const lastLog = trainingLogs.value.at(-1)
        if (lastLog !== stageMsg) {
          trainingLogs.value.push(stageMsg)
          nextTick(() => {
            const el = trainingLogEl.value
            if (el)
              el.scrollTop = el.scrollHeight
          })
        }
      }

      if (data.job.currentEpoch != null)
        trainingStore.currentEpoch = data.job.currentEpoch
      if (data.job.totalEpochs != null)
        trainingStore.totalEpochs = data.job.totalEpochs
      if (data.job.lossG != null)
        trainingStore.lossG = data.job.lossG
      if (data.job.lossD != null)
        trainingStore.lossD = data.job.lossD

      if (data.job.status === 'completed') {
        trainingStore.currentEpoch = trainingStore.totalEpochs
        trainingLogs.value.push('Training completed successfully!')

        // Fetch validation report if available
        if (voiceId.value) {
          try {
            const reportRes = await singingFetch(`/models/${voiceId.value}/report`)
            if (reportRes.ok) {
              reportCard.value = await reportRes.json() as ReportCardData
              trainingLogs.value.push(`Quality grade: ${reportCard.value.overall_grade}`)
            }
          }
          catch { /* report not available, non-fatal */ }
        }

        stopPolling()
        return
      }

      if (data.job.status === 'failed') {
        trainingLogs.value.push(`Error: ${data.job.error ?? 'Unknown error'}`)
        trainingStore.error = data.job.error ?? 'Unknown error'
        stopPolling()
        return
      }

      pollTimer = setTimeout(poll, 3000)
    }
    catch {
      pollTimer = setTimeout(poll, 5000)
    }
  }
  poll()
}

function stopPolling() {
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
  if (elapsedTimer) {
    clearInterval(elapsedTimer)
    elapsedTimer = null
  }
}

onUnmounted(() => stopPolling())
</script>

<template>
  <form class="flex flex-col gap-4" @submit.prevent="handleStartTraining">
    <!-- Voice ID -->
    <div>
      <label class="mb-1 block text-sm text-neutral-700 font-medium dark:text-neutral-300">Voice ID</label>
      <div class="mb-1.5 text-xs text-neutral-400 dark:text-neutral-500">
        A unique name for your custom voice model (will be used as the .pth filename)
      </div>
      <input
        v-model="voiceId"
        type="text"
        placeholder="e.g. my_voice"
        class="w-full border border-neutral-300 rounded-lg bg-white px-3 py-2 text-sm outline-none transition-colors dark:border-neutral-600 focus:border-primary-400 dark:bg-neutral-800 dark:focus:border-primary-500"
      >
    </div>

    <!-- Dataset Upload -->
    <div>
      <label class="mb-1 block text-sm text-neutral-700 font-medium dark:text-neutral-300">Training Dataset</label>
      <div
        v-if="!datasetFile"
        class="cursor-pointer border-2 rounded-xl p-6 text-center transition-all duration-200"
        :class="isDragOver
          ? 'border-primary-400 bg-primary-50 dark:border-primary-500 dark:bg-primary-900/20'
          : 'border-neutral-300 border-dashed bg-neutral-50 hover:border-primary-300 dark:border-neutral-600 dark:bg-neutral-800/50 dark:hover:border-primary-600'"
        @dragover.prevent="isDragOver = true"
        @dragleave="isDragOver = false"
        @drop.prevent="handleFileDrop"
        @click="($refs.datasetInput as HTMLInputElement)?.click()"
      >
        <div class="flex flex-col items-center gap-2">
          <div class="text-3xl text-neutral-400 dark:text-neutral-500" :class="isDragOver ? 'i-solar:upload-bold-duotone text-primary-500' : 'i-solar:database-bold-duotone'" />
          <div class="text-sm text-neutral-500 dark:text-neutral-400">
            {{ isDragOver ? 'Drop file here' : 'Click or drag training audio file here' }}
          </div>
          <div class="text-xs text-neutral-400 dark:text-neutral-500">
            Clean vocal recordings, 10+ minutes recommended. Supports audio files and .zip archives.
          </div>
        </div>
      </div>
      <input ref="datasetInput" type="file" accept="audio/*,.zip" class="hidden" @change="handleFileSelect">

      <div v-if="datasetFile" class="flex items-center gap-3 border border-green-200 rounded-xl bg-green-50 p-3 dark:border-green-800 dark:bg-green-900/20">
        <div class="i-solar:database-bold-duotone text-xl text-green-600 dark:text-green-400" />
        <div class="min-w-0 flex-1">
          <div class="truncate text-sm text-neutral-800 font-medium dark:text-neutral-200">
            {{ datasetFile.name }}
          </div>
          <div class="text-xs text-neutral-500">
            {{ fileSizeDisplay(datasetFile) }}
          </div>
        </div>
        <button type="button" class="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-200 dark:hover:bg-neutral-700" @click="removeFile">
          <div class="i-solar:close-circle-bold-duotone text-lg" />
        </button>
      </div>
    </div>

    <!-- Parameters -->
    <details class="group">
      <summary class="cursor-pointer list-none text-sm text-neutral-500 font-medium dark:text-neutral-400">
        <div class="flex items-center gap-1.5">
          <div class="i-solar:settings-bold-duotone text-base" />
          <span>Training Parameters</span>
          <div class="i-solar:alt-arrow-down-line-duotone text-base transition-transform group-open:rotate-180" />
        </div>
      </summary>
      <div class="grid grid-cols-2 mt-3 gap-3">
        <div>
          <label class="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">Epochs</label>
          <input v-model.number="epochs" type="number" min="1" class="w-full border border-neutral-300 rounded-lg bg-white px-2.5 py-1.5 text-sm outline-none transition-colors dark:border-neutral-600 focus:border-primary-400 dark:bg-neutral-800 dark:focus:border-primary-500">
          <p class="mt-0.5 text-xs text-neutral-400">
            More epochs = better quality but longer training time
          </p>
        </div>
        <div>
          <label class="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">Batch Size</label>
          <input v-model.number="batchSize" type="number" min="1" class="w-full border border-neutral-300 rounded-lg bg-white px-2.5 py-1.5 text-sm outline-none transition-colors dark:border-neutral-600 focus:border-primary-400 dark:bg-neutral-800 dark:focus:border-primary-500">
          <p class="mt-0.5 text-xs text-neutral-400">
            Higher = faster but uses more GPU memory
          </p>
        </div>
      </div>
    </details>

    <!-- Error -->
    <div v-if="submitError" class="flex items-start gap-2 border border-red-200 rounded-lg bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
      <div class="i-solar:danger-triangle-bold-duotone mt-0.5 text-lg text-red-500" />
      <div class="flex-1">
        <div class="text-sm text-red-700 font-medium dark:text-red-400">
          Training Failed
        </div>
        <div class="mt-0.5 text-xs text-red-600 dark:text-red-400/80">
          {{ submitError }}
        </div>
      </div>
    </div>

    <!-- Training Progress -->
    <div v-if="trainingStore.isTraining || trainingStore.status === 'completed' || trainingStore.status === 'failed'" class="overflow-hidden border rounded-xl" :class="trainingStore.status === 'completed' ? 'border-green-200 dark:border-green-800' : trainingStore.status === 'failed' ? 'border-red-200 dark:border-red-800' : 'border-blue-200 dark:border-blue-800'">
      <!-- Header -->
      <div class="p-4" :class="trainingStore.status === 'completed' ? 'bg-green-50 dark:bg-green-900/20' : trainingStore.status === 'failed' ? 'bg-red-50 dark:bg-red-900/20' : 'bg-blue-50 dark:bg-blue-900/20'">
        <div class="mb-2 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div v-if="trainingStore.isTraining" class="i-solar:cpu-bolt-bold-duotone animate-pulse text-base text-blue-500" />
            <div v-else-if="trainingStore.status === 'completed'" class="i-solar:check-circle-bold-duotone text-base text-green-500" />
            <div v-else class="i-solar:danger-triangle-bold-duotone text-base text-red-500" />
            <span class="text-sm font-medium" :class="trainingStore.status === 'completed' ? 'text-green-700 dark:text-green-400' : trainingStore.status === 'failed' ? 'text-red-700 dark:text-red-400' : 'text-blue-700 dark:text-blue-400'">
              {{ trainingStore.isTraining ? 'Training in progress' : trainingStore.status === 'completed' ? 'Training complete' : 'Training failed' }}
            </span>
          </div>
          <div class="flex items-center gap-3">
            <span v-if="elapsed > 0" class="text-xs text-neutral-400 font-mono tabular-nums">{{ formatTime(elapsed) }}</span>
            <span class="text-sm font-mono tabular-nums" :class="trainingStore.status === 'completed' ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'">{{ trainingStore.progress }}%</span>
          </div>
        </div>
        <!-- Progress bar -->
        <div class="mb-2 h-2 w-full overflow-hidden rounded-full" :class="trainingStore.status === 'completed' ? 'bg-green-100 dark:bg-green-800' : 'bg-blue-100 dark:bg-blue-800'">
          <div
            class="h-full rounded-full transition-all duration-300"
            :class="trainingStore.status === 'completed' ? 'bg-green-500' : 'bg-blue-500'"
            :style="{ width: `${trainingStore.progress}%` }"
          />
        </div>
        <!-- Step counter -->
        <div class="flex items-center justify-between text-xs">
          <span :class="trainingStore.status === 'completed' ? 'text-green-600 dark:text-green-400/80' : 'text-blue-600 dark:text-blue-400/80'">
            <template v-if="trainingStore.trainingStepTotal > 0">
              Step {{ trainingStore.trainingStep }} / {{ trainingStore.trainingStepTotal }}
              <span v-if="trainingStore.trainingStepName" class="ml-1 text-neutral-400">· {{ trainingStore.trainingStepName }}</span>
            </template>
            <template v-else>
              Epoch {{ trainingStore.currentEpoch }} / {{ trainingStore.totalEpochs }}
            </template>
          </span>
          <span v-if="trainingStore.isTraining && elapsed > 0 && trainingStore.progress > 0 && trainingStore.progress < 100" class="text-neutral-400">
            ~{{ formatTime(Math.round(elapsed / trainingStore.progress * (100 - trainingStore.progress))) }} remaining
          </span>
        </div>
        <!-- GAN training details -->
        <div v-if="trainingStore.isGanTraining && trainingStore.currentEpoch > 0" class="mt-1.5 flex items-center gap-3 text-xs">
          <span class="rounded bg-indigo-100 px-1.5 py-0.5 text-indigo-700 font-mono tabular-nums dark:bg-indigo-900/40 dark:text-indigo-300">
            Epoch {{ trainingStore.currentEpoch }} / {{ trainingStore.totalEpochs }}
          </span>
          <span v-if="trainingStore.lossG != null" class="text-neutral-500 font-mono tabular-nums dark:text-neutral-400">
            G: {{ trainingStore.lossG.toFixed(3) }}
          </span>
          <span v-if="trainingStore.lossD != null" class="text-neutral-500 font-mono tabular-nums dark:text-neutral-400">
            D: {{ trainingStore.lossD.toFixed(3) }}
          </span>
        </div>
      </div>
      <!-- Log area -->
      <div v-if="trainingLogs.length > 0" ref="trainingLogEl" class="max-h-40 overflow-y-auto bg-neutral-950 px-3 py-2 text-xs leading-relaxed font-mono">
        <div v-for="(line, i) in trainingLogs" :key="i" class="text-neutral-400">
          <span v-if="line.startsWith('Error:')" class="text-red-400">{{ line }}</span>
          <span v-else-if="line.includes('completed') || line.includes('success')" class="text-green-400">{{ line }}</span>
          <span v-else-if="line.startsWith('Stage:')" class="text-blue-400">{{ line }}</span>
          <span v-else>{{ line }}</span>
        </div>
      </div>
    </div>

    <!-- Report Card -->
    <div v-if="reportCard" class="overflow-hidden border border-green-200 rounded-xl dark:border-green-800">
      <div class="flex items-center justify-between bg-green-50 p-4 dark:bg-green-900/20">
        <div class="flex items-center gap-2">
          <div class="i-solar:diploma-verified-bold-duotone text-base text-green-500" />
          <span class="text-sm text-green-700 font-medium dark:text-green-400">Voice Model Report Card</span>
        </div>
        <span
          class="rounded-lg px-2.5 py-1 text-lg font-bold"
          :class="{
            'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400': reportCard.overall_grade === 'A',
            'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400': reportCard.overall_grade === 'B',
            'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400': reportCard.overall_grade === 'C',
            'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400': reportCard.overall_grade === 'D',
            'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400': reportCard.overall_grade === 'F',
          }"
        >
          {{ reportCard.overall_grade }}
        </span>
      </div>
      <div class="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
        <div class="rounded-lg bg-neutral-50 p-2.5 text-center dark:bg-neutral-800/50">
          <div class="text-xs text-neutral-400 dark:text-neutral-500">
            Identity
          </div>
          <div class="text-lg font-bold" :class="reportCard.singer_similarity >= 0.6 ? 'text-green-600' : 'text-amber-600'">
            {{ (reportCard.singer_similarity * 100).toFixed(0) }}%
          </div>
        </div>
        <div class="rounded-lg bg-neutral-50 p-2.5 text-center dark:bg-neutral-800/50">
          <div class="text-xs text-neutral-400 dark:text-neutral-500">
            Content
          </div>
          <div class="text-lg font-bold" :class="reportCard.content_score >= 0.5 ? 'text-green-600' : 'text-amber-600'">
            {{ (reportCard.content_score * 100).toFixed(0) }}%
          </div>
        </div>
        <div class="rounded-lg bg-neutral-50 p-2.5 text-center dark:bg-neutral-800/50">
          <div class="text-xs text-neutral-400 dark:text-neutral-500">
            Melody
          </div>
          <div class="text-lg font-bold" :class="reportCard.f0_corr >= 0.7 ? 'text-green-600' : 'text-amber-600'">
            {{ (reportCard.f0_corr * 100).toFixed(0) }}%
          </div>
        </div>
        <div class="rounded-lg bg-neutral-50 p-2.5 text-center dark:bg-neutral-800/50">
          <div class="text-xs text-neutral-400 dark:text-neutral-500">
            MOS
          </div>
          <div class="text-lg font-bold" :class="reportCard.naturalness_mos >= 3.0 ? 'text-green-600' : 'text-amber-600'">
            {{ reportCard.naturalness_mos.toFixed(1) }}
          </div>
        </div>
      </div>
      <!-- Worst samples -->
      <div v-if="reportCard.worst_samples.length > 0" class="border-t border-neutral-100 px-4 py-2.5 dark:border-neutral-800">
        <div class="mb-1.5 text-xs text-neutral-500 font-medium dark:text-neutral-400">
          Areas for Improvement
        </div>
        <div class="space-y-1">
          <div v-for="(ws, i) in reportCard.worst_samples.slice(0, 3)" :key="i" class="flex items-center gap-2 text-xs">
            <div class="i-solar:danger-circle-bold-duotone text-xs text-amber-500" />
            <span class="text-neutral-500 dark:text-neutral-400">{{ ws.failure_reason }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Submit -->
    <button
      type="submit"
      :disabled="!canSubmit"
      class="flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm text-white font-medium transition-all duration-200"
      :class="canSubmit ? 'bg-primary-500 shadow-sm hover:bg-primary-600 active:scale-[0.98]' : 'cursor-not-allowed bg-neutral-300 dark:bg-neutral-700'"
    >
      <div v-if="isSubmitting" class="i-solar:spinner-line-duotone animate-spin text-base" />
      <div v-else-if="trainingStore.isTraining" class="i-solar:cpu-bolt-bold-duotone text-base" />
      <div v-else class="i-solar:play-circle-bold-duotone text-base" />
      <span>{{ isSubmitting ? 'Submitting...' : trainingStore.isTraining ? 'Training...' : 'Start Training' }}</span>
    </button>
  </form>
</template>
