<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

const props = defineProps<{
  status: string
  currentStage: string | null
  progress: number
  error: string | null
}>()

interface StageInfo {
  id: string
  label: string
  description: string
  icon: string
}

const stages: StageInfo[] = [
  { id: 'prepare_source', label: 'Source Preparation', description: 'Transcoding input audio to 44.1kHz WAV format', icon: 'i-solar:file-check-bold-duotone' },
  { id: 'separate_vocals', label: 'Vocal Separation', description: 'Splitting vocals from instrumental using MelBand-RoFormer neural network', icon: 'i-solar:music-note-slider-2-bold-duotone' },
  { id: 'extract_f0', label: 'Pitch Extraction', description: 'Extracting fundamental frequency (F0) curve using RMVPE', icon: 'i-solar:chart-2-bold-duotone' },
  { id: 'auto_calibrate', label: 'Auto-Calibrate', description: 'Analyzing source audio and predicting optimal conversion parameters', icon: 'i-solar:magic-stick-3-bold-duotone' },
  { id: 'convert_vocals', label: 'Voice Conversion', description: 'Converting vocal timbre to target voice using RVC model', icon: 'i-solar:soundwave-bold-duotone' },
  { id: 'postprocess_vocals', label: 'Post-processing', description: 'Applying noise gate, normalization, and format alignment', icon: 'i-solar:tuning-2-bold-duotone' },
  { id: 'remix', label: 'Remix & Mix', description: 'Merging converted vocals with original instrumental track', icon: 'i-solar:playlist-minimalistic-bold-duotone' },
  { id: 'evaluate', label: 'Quality Gate', description: 'Validating output against voice profile for identity, melody, and naturalness', icon: 'i-solar:shield-check-bold-duotone' },
  { id: 'finalize', label: 'Finalize', description: 'Writing manifest and organizing output artifacts', icon: 'i-solar:check-circle-bold-duotone' },
]

const currentStageIndex = computed(() => {
  if (!props.currentStage)
    return -1
  return stages.findIndex(s => s.id === props.currentStage)
})

const activeStage = computed(() => {
  if (currentStageIndex.value < 0)
    return null
  return stages[currentStageIndex.value]
})

function stageState(index: number): 'completed' | 'active' | 'pending' {
  if (props.status === 'completed')
    return 'completed'
  if (currentStageIndex.value < 0)
    return 'pending'
  if (index < currentStageIndex.value)
    return 'completed'
  if (index === currentStageIndex.value)
    return 'active'
  return 'pending'
}

const statusLabel = computed(() => {
  switch (props.status) {
    case 'running': return 'Pipeline Running'
    case 'completed': return 'Processing Complete'
    case 'failed': return 'Pipeline Failed'
    case 'pending': return 'Queued'
    default: return props.status
  }
})

const startTime = ref(Date.now())
const elapsed = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  startTime.value = Date.now()
  timer = setInterval(() => {
    elapsed.value = Math.round((Date.now() - startTime.value) / 1000)
  }, 1000)
})

onUnmounted(() => {
  if (timer)
    clearInterval(timer)
})

function formatTime(s: number): string {
  if (s < 60)
    return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m ${s % 60}s`
}
</script>

<template>
  <div class="border border-neutral-200 rounded-xl p-4 dark:border-neutral-700">
    <!-- Header -->
    <div class="mb-3 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <div v-if="status === 'running'" class="i-solar:rewind-forward-bold-duotone animate-pulse text-lg text-primary-500" />
        <div v-else-if="status === 'completed'" class="i-solar:check-circle-bold-duotone text-lg text-green-500" />
        <div v-else-if="status === 'failed'" class="i-solar:danger-triangle-bold-duotone text-lg text-red-500" />
        <div v-else class="i-solar:clock-circle-bold-duotone text-lg text-neutral-400" />
        <span class="text-sm text-neutral-800 font-medium dark:text-neutral-200">{{ statusLabel }}</span>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-xs text-neutral-400 font-mono tabular-nums">{{ formatTime(elapsed) }}</span>
        <span class="text-sm text-neutral-500 font-mono tabular-nums">{{ progress }}%</span>
      </div>
    </div>

    <!-- Overall Progress Bar -->
    <div class="mb-1 h-2 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
      <div
        class="h-full rounded-full transition-all duration-500 ease-out"
        :class="{
          'bg-primary-500': status === 'running',
          'bg-green-500': status === 'completed',
          'bg-red-500': status === 'failed',
          'bg-neutral-400': status === 'pending',
        }"
        :style="{ width: `${progress}%` }"
      />
    </div>

    <!-- Active stage description -->
    <div v-if="activeStage && status === 'running'" class="mb-3 mt-2 flex items-center gap-2 rounded-lg bg-primary-50 px-3 py-2 dark:bg-primary-900/15">
      <div class="i-svg-spinners:ring-resize text-xs text-primary-500" />
      <span class="text-xs text-primary-700 dark:text-primary-400">{{ activeStage.description }}</span>
    </div>

    <!-- Stage Steps -->
    <div class="grid mt-3 gap-0.5">
      <div
        v-for="(stage, i) in stages" :key="stage.id"
        class="flex items-start gap-3 rounded-lg px-2.5 py-2 text-sm transition-all duration-200"
        :class="{
          'bg-primary-50 dark:bg-primary-900/15': stageState(i) === 'active',
          'opacity-35': stageState(i) === 'pending',
        }"
      >
        <!-- Icon -->
        <div class="relative mt-0.5 flex shrink-0 items-center justify-center">
          <div v-if="stageState(i) === 'completed'" class="i-solar:check-circle-bold-duotone text-base text-green-500" />
          <div v-else-if="stageState(i) === 'active'" class="text-base text-primary-500" :class="stage.icon" />
          <div v-else class="size-4 border-2 border-neutral-300 rounded-full dark:border-neutral-600" />
        </div>

        <!-- Content -->
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span
              class="text-xs font-medium"
              :class="{
                'text-green-600 dark:text-green-400': stageState(i) === 'completed',
                'text-primary-600 dark:text-primary-400': stageState(i) === 'active',
                'text-neutral-400 dark:text-neutral-500': stageState(i) === 'pending',
              }"
            >
              {{ stage.label }}
            </span>
            <div v-if="stageState(i) === 'active'" class="i-svg-spinners:ring-resize text-xs text-primary-400" />
          </div>
          <p
            v-if="stageState(i) === 'active' || stageState(i) === 'completed'"
            class="mt-0.5 text-xs"
            :class="stageState(i) === 'active' ? 'text-primary-600/70 dark:text-primary-400/60' : 'text-neutral-400 dark:text-neutral-600'"
          >
            {{ stage.description }}
          </p>
        </div>

        <!-- Step number -->
        <span class="mt-0.5 shrink-0 text-xs text-neutral-300 font-mono dark:text-neutral-700">{{ i + 1 }}/{{ stages.length }}</span>
      </div>
    </div>

    <!-- Error -->
    <div v-if="error" class="mt-3 flex items-start gap-2 border border-red-200 rounded-lg bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
      <div class="i-solar:danger-triangle-bold-duotone mt-0.5 text-base text-red-500" />
      <div class="flex-1 text-xs text-red-600 dark:text-red-400">
        {{ error }}
      </div>
    </div>
  </div>
</template>
