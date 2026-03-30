<script setup lang="ts">
import type {
  SingingBaseModelInfo,
  SingingHealthResponse,
  SingingModelsResponse,
  SingingVoiceModelInfo,
} from '../../../types/singing'

import { errorMessageFrom } from '@moeru/std'
import { useLocalStorage } from '@vueuse/core'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

import ArtifactPlayer from './artifact-player.vue'
import CoverForm from './cover-form.vue'
import JobProgress from './job-progress.vue'
import TrainingPanel from './training-panel.vue'

import { useSingingApi } from '../../../composables/use-singing-api'
import { useSingingCoverRuntime } from '../../../composables/use-singing-cover-runtime'
import { useSingingTrainingRuntime } from '../../../composables/use-singing-training-runtime'
import { useSingingArtifactsStore } from '../../../stores/modules/singing/artifacts'
import { useSingingCoverStore } from '../../../stores/modules/singing/cover'
import { useSingingTrainingStore } from '../../../stores/modules/singing/training'

const activeTab = useLocalStorage<'cover' | 'training'>('singing/ui/active-tab', 'cover')

const coverStore = useSingingCoverStore()
const trainingStore = useSingingTrainingStore()
const artifactsStore = useSingingArtifactsStore()
const coverRuntime = useSingingCoverRuntime()
const trainingRuntime = useSingingTrainingRuntime()
const { singingFetch } = useSingingApi()

type HealthState = SingingHealthResponse & {
  loaded: boolean
  serverReachable: boolean
  error: string | null
}

function createEmptyHealthState(): HealthState {
  return {
    loaded: false,
    serverReachable: false,
    error: null,
    status: 'setup_required',
    setupSupported: false,
    ffmpeg: false,
    ffmpegPath: null,
    python: false,
    pythonPath: null,
    pythonVenv: false,
    pythonVenvExists: false,
    pythonPackagesInstalled: false,
    pythonPackagesMissing: [],
    uvAvailable: false,
    venvExists: false,
    modelsDir: null,
    singingPkgRoot: null,
    moduleLoaded: false,
    baseModels: [],
    baseModelsReady: false,
  }
}

const health = ref<HealthState>(createEmptyHealthState())

interface LogEntry { ts: number, level: string, text: string }
interface SetupTask {
  running: boolean
  error: string | null
  progress: { step: string, percent: number, message: string } | null
  logs: LogEntry[]
  startedAt: number
  completedOnce: boolean
}

function emptyTask(): SetupTask {
  return { running: false, error: null, progress: null, logs: [], startedAt: 0, completedOnce: false }
}

const setupFFmpeg = ref<SetupTask>(emptyTask())
const setupPython = ref<SetupTask>(emptyTask())
const setupModels = ref<SetupTask>(emptyTask())

const voiceModels = ref<SingingVoiceModelInfo[]>([])
const modelsLoading = ref(false)
const setupPollTimers = new Map<'ffmpeg' | 'python' | 'models', ReturnType<typeof setTimeout>>()

const ffmpegLogEl = ref<HTMLElement>()
const pythonLogEl = ref<HTMLElement>()
const modelsLogEl = ref<HTMLElement>()

const envReady = computed(() =>
  health.value.loaded
  && health.value.serverReachable
  && health.value.ffmpeg
  && health.value.pythonVenv,
)

const allReady = computed(() =>
  envReady.value && health.value.baseModelsReady,
)
const selfSetupSupported = computed(() => health.value.setupSupported)

const needsEnvSetup = computed(() =>
  health.value.loaded
  && health.value.serverReachable
  && selfSetupSupported.value
  && (!health.value.ffmpeg || !health.value.pythonVenv),
)

const needsBaseModels = computed(() =>
  envReady.value && selfSetupSupported.value && !health.value.baseModelsReady,
)

const needsManagedProvisioning = computed(() =>
  health.value.loaded
  && health.value.serverReachable
  && !selfSetupSupported.value
  && !allReady.value,
)

const managedProvisioningIssues = computed(() => {
  const issues: string[] = []

  if (!health.value.ffmpeg)
    issues.push('FFmpeg is not available on the server singing runtime.')
  if (!health.value.pythonVenv)
    issues.push('Python runtime or required packages are not ready on the server singing runtime.')
  if (!health.value.baseModelsReady)
    issues.push('Required base models are missing from the server singing runtime.')

  return issues
})

const baseModelsByCategory = computed(() => {
  const groups: Record<string, { label: string, models: SingingBaseModelInfo[] }> = {}
  const categoryLabels: Record<string, string> = {
    pitch: 'Pitch Extraction',
    encoder: 'Content Encoder',
    separation: 'Vocal Separation',
    pretrained: 'Training Base Models',
  }
  for (const m of health.value.baseModels) {
    if (!groups[m.category]) {
      groups[m.category] = { label: categoryLabels[m.category] ?? m.category, models: [] }
    }
    groups[m.category].models.push(m)
  }
  return groups
})

const baseModelsSummary = computed(() => {
  const total = health.value.baseModels.length
  const ready = health.value.baseModels.filter(m => m.exists).length
  const totalSize = health.value.baseModels.filter(m => !m.exists).reduce((s, m) => s + m.sizeBytes, 0)
  return { total, ready, missing: total - ready, totalSize }
})

onMounted(async () => {
  await Promise.all([
    coverRuntime.resumeActiveJob(),
    trainingRuntime.resumeActiveJob(),
  ])

  await checkHealth()
  if (envReady.value)
    await loadModels()

  if (!health.value.setupSupported)
    return

  const resumed = await resumeRunningSetups()
  if (!resumed && health.value.serverReachable && !allReady.value) {
    await startOneClickSetup()
  }
})

watch(
  () => trainingStore.status,
  async (status, previousStatus) => {
    if (status === 'completed' && previousStatus !== 'completed' && envReady.value)
      await loadModels()
  },
)

async function resumeRunningSetups(): Promise<boolean> {
  let anyResumed = false
  try {
    const res = await singingFetch('/setup/status')
    if (!res.ok)
      return false
    const data = await res.json() as Record<string, any>
    for (const type of ['ffmpeg', 'python', 'models'] as const) {
      const status = data[type]
      if (status && !status.completed && !status.error) {
        const task = type === 'ffmpeg' ? setupFFmpeg : type === 'python' ? setupPython : setupModels
        task.value = {
          running: true,
          error: null,
          progress: { step: status.step, percent: status.percent ?? 0, message: status.message ?? '' },
          logs: status.logs ?? [],
          startedAt: status.startedAt ?? Date.now(),
          completedOnce: false,
        }
        startPollingSetupStatus(type)
        anyResumed = true
      }
    }
  }
  catch {}
  return anyResumed
}

onUnmounted(() => {
  for (const timer of setupPollTimers.values())
    clearTimeout(timer)
  setupPollTimers.clear()
})

async function checkHealth() {
  try {
    const res = await singingFetch('/health')
    if (res.ok) {
      const data = await res.json() as Partial<SingingHealthResponse>
      health.value = {
        ...createEmptyHealthState(),
        ffmpeg: !!data.ffmpeg,
        ffmpegPath: data.ffmpegPath ?? null,
        python: !!data.python,
        pythonPath: data.pythonPath ?? null,
        pythonVenv: !!data.pythonVenv,
        pythonVenvExists: !!data.pythonVenvExists,
        pythonPackagesInstalled: !!data.pythonPackagesInstalled,
        pythonPackagesMissing: Array.isArray(data.pythonPackagesMissing) ? data.pythonPackagesMissing : [],
        uvAvailable: !!data.uvAvailable,
        venvExists: !!data.venvExists,
        modelsDir: data.modelsDir ?? null,
        singingPkgRoot: data.singingPkgRoot ?? null,
        moduleLoaded: !!data.moduleLoaded,
        baseModels: Array.isArray(data.baseModels) ? data.baseModels : [],
        baseModelsReady: !!data.baseModelsReady,
        status: data.status ?? 'degraded',
        setupSupported: !!data.setupSupported,
        platform: data.platform,
        arch: data.arch,
        loaded: true,
        serverReachable: true,
        error: null,
      }
    }
    else {
      health.value = { ...health.value, loaded: true, serverReachable: true, error: `Server returned ${res.status}` }
    }
  }
  catch (e) {
    health.value = { ...health.value, loaded: true, serverReachable: false, error: errorMessageFrom(e) ?? 'Cannot reach singing service' }
  }
}

async function loadModels() {
  modelsLoading.value = true
  try {
    const res = await singingFetch('/models')
    if (res.ok) {
      const data = await res.json() as SingingModelsResponse
      voiceModels.value = data.voiceModels
      health.value.baseModels = data.baseModels

      // Fetch quality grades for each voice model
      for (const vm of voiceModels.value) {
        try {
          const reportRes = await singingFetch(`/models/${vm.name}/report`)
          if (reportRes.ok) {
            const report = await reportRes.json() as { overall_grade?: string }
            vm.grade = report.overall_grade
          }
        }
        catch { /* grade not available, non-fatal */ }
      }
    }
  }
  catch {}
  finally { modelsLoading.value = false }
}

async function startSetup(type: 'ffmpeg' | 'python' | 'models') {
  const task = type === 'ffmpeg' ? setupFFmpeg : type === 'python' ? setupPython : setupModels

  if (task.value.running)
    return

  if (!health.value.setupSupported) {
    task.value = {
      ...emptyTask(),
      error: 'This singing runtime is managed by the server and cannot run setup from the current UI.',
    }
    return
  }

  task.value = { running: true, error: null, progress: { step: 'init', percent: 0, message: 'Starting...' }, logs: [], startedAt: Date.now(), completedOnce: false }

  startPollingSetupStatus(type)

  try {
    const res = await singingFetch(`/setup/${type}`, { method: 'POST' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: res.statusText }))
      task.value.error = data.error || `Setup failed: ${res.status}`
      task.value.running = false
    }
  }
  catch (err) {
    if (!task.value.progress || task.value.progress.step === 'init') {
      task.value.running = false
      task.value.error = errorMessageFrom(err) ?? 'Failed to start setup task'
    }
  }
}

const autoSetupRunning = ref(false)

function startPollingSetupStatus(type: 'ffmpeg' | 'python' | 'models') {
  const task = type === 'ffmpeg' ? setupFFmpeg : type === 'python' ? setupPython : setupModels
  const logEl = type === 'ffmpeg' ? ffmpegLogEl : type === 'python' ? pythonLogEl : modelsLogEl

  const scheduleNextPoll = (delayMs: number) => {
    const existingTimer = setupPollTimers.get(type)
    if (existingTimer)
      clearTimeout(existingTimer)

    const nextTimer = setTimeout(() => {
      void poll()
    }, delayMs)
    setupPollTimers.set(type, nextTimer)
  }

  async function poll() {
    try {
      const res = await singingFetch('/setup/status')
      if (!res.ok) {
        scheduleNextPoll(2500)
        return
      }
      const data = await res.json() as Record<string, any>
      const status = data[type]
      if (status) {
        task.value.progress = { step: status.step, percent: status.percent ?? 0, message: status.message ?? '' }
        if (status.logs?.length)
          task.value.logs = status.logs
        if (status.startedAt)
          task.value.startedAt = status.startedAt

        nextTick(() => {
          const el = logEl.value
          if (el)
            el.scrollTop = el.scrollHeight
        })

        if (status.error) {
          task.value.error = status.error
          task.value.running = false
          autoSetupRunning.value = false
          const existingTimer = setupPollTimers.get(type)
          if (existingTimer)
            clearTimeout(existingTimer)
          setupPollTimers.delete(type)
          return
        }
        if (status.completed) {
          task.value.running = false
          task.value.completedOnce = true
          const existingTimer = setupPollTimers.get(type)
          if (existingTimer)
            clearTimeout(existingTimer)
          setupPollTimers.delete(type)
          await checkHealth()
          if (envReady.value)
            await loadModels()
          if (autoSetupRunning.value)
            await continueAutoSetup()
          return
        }
      }
      scheduleNextPoll(1000)
    }
    catch {
      scheduleNextPoll(2500)
    }
  }

  poll()
}

async function continueAutoSetup() {
  await checkHealth()
  const h = health.value
  if (!h.serverReachable) {
    autoSetupRunning.value = false
    return
  }
  if (!h.setupSupported) {
    autoSetupRunning.value = false
    return
  }
  if (!h.ffmpeg && !setupFFmpeg.value.running && !setupFFmpeg.value.completedOnce) {
    await startSetup('ffmpeg')
    return
  }
  // Trust completedOnce flag 鈥?avoid re-triggering if health cache hasn't caught up
  if (!h.pythonVenv && !setupPython.value.running && !setupPython.value.completedOnce) {
    if (!h.python && !h.uvAvailable) {
      autoSetupRunning.value = false
      return
    }
    await startSetup('python')
    return
  }
  if (!h.baseModelsReady && !setupModels.value.running && !setupModels.value.completedOnce) {
    await startSetup('models')
    return
  }
  // All steps either completed or health confirms ready
  autoSetupRunning.value = false
}

async function startOneClickSetup() {
  autoSetupRunning.value = true
  await continueAutoSetup()
}

function formatElapsed(startedAt: number): string {
  const s = Math.round((Date.now() - startedAt) / 1000)
  if (s < 60)
    return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m ${s % 60}s`
}

function formatLogTs(ts: number, startedAt: number): string {
  const s = Math.round((ts - startedAt) / 1000)
  const m = Math.floor(s / 60)
  const sec = String(s % 60).padStart(2, '0')
  return `${m}:${sec}`
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(0)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

async function retrySetup() {
  await checkHealth()
  if (envReady.value)
    await loadModels()
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <!-- Loading -->
    <div v-if="!health.loaded" class="flex items-center justify-center py-8">
      <div class="flex items-center gap-2 text-neutral-400">
        <div class="i-svg-spinners:ring-resize text-lg" />
        <span class="text-sm">Checking environment...</span>
      </div>
    </div>

    <!-- Server unreachable -->
    <div v-else-if="!health.serverReachable" class="border border-red-200 rounded-xl bg-red-50 p-5 dark:border-red-800 dark:bg-red-900/20">
      <div class="mb-3 flex items-center gap-2">
        <div class="i-solar:server-square-cloud-bold-duotone text-xl text-red-500" />
        <span class="text-sm text-red-700 font-semibold dark:text-red-400">Singing Service Unreachable</span>
      </div>
      <p class="mb-3 text-xs text-red-600 leading-relaxed dark:text-red-400/80">
        The local singing server is not responding. Please restart the application.
      </p>
      <div v-if="health.error" class="mt-2 border border-red-200 rounded bg-red-100 px-3 py-1.5 text-xs text-red-700 font-mono dark:border-red-700 dark:bg-red-900/40 dark:text-red-300">
        {{ health.error }}
      </div>
      <button
        class="mt-3 flex items-center gap-1.5 rounded-lg bg-red-100 px-3 py-1.5 text-xs text-red-700 font-medium transition-colors dark:bg-red-900/40 hover:bg-red-200 dark:text-red-400 dark:hover:bg-red-900/60"
        @click="checkHealth"
      >
        <div class="i-solar:refresh-bold text-sm" />
        Retry Connection
      </button>
    </div>

    <!-- Server-managed runtime -->
    <div v-else-if="needsManagedProvisioning" class="border border-amber-200 rounded-xl bg-amber-50/80 p-5 dark:border-amber-800 dark:bg-amber-900/20">
      <div class="mb-3 flex items-center gap-2">
        <div class="i-solar:server-bold-duotone text-xl text-amber-500" />
        <span class="text-sm text-amber-700 font-semibold dark:text-amber-400">Server Provisioning Required</span>
      </div>
      <p class="text-xs text-amber-700 leading-relaxed dark:text-amber-300/90">
        This singing runtime is managed outside the current UI. The server environment needs to be provisioned before cover generation and voice training can run.
      </p>
      <ul v-if="managedProvisioningIssues.length > 0" class="mt-3 flex flex-col gap-1 text-xs text-amber-700 dark:text-amber-300/90">
        <li v-for="issue in managedProvisioningIssues" :key="issue" class="flex items-start gap-2">
          <div class="i-solar:danger-circle-bold-duotone mt-0.5 shrink-0 text-sm text-amber-500" />
          <span>{{ issue }}</span>
        </li>
      </ul>
      <button
        class="mt-4 flex items-center gap-1.5 rounded-lg bg-amber-100 px-3 py-1.5 text-xs text-amber-700 font-medium transition-colors dark:bg-amber-900/40 hover:bg-amber-200 dark:text-amber-400 dark:hover:bg-amber-900/60"
        @click="retrySetup"
      >
        <div class="i-solar:refresh-bold text-sm" />
        Refresh Runtime Status
      </button>
    </div>

    <!-- Step 1: Environment Setup Wizard (FFmpeg + Python) -->
    <div v-else-if="needsEnvSetup" class="flex flex-col gap-4">
      <div class="border border-amber-200 rounded-xl bg-amber-50/80 p-5 dark:border-amber-800 dark:bg-amber-900/20">
        <div class="mb-3 flex items-center gap-2">
          <div class="i-solar:tuning-2-bold-duotone text-xl text-amber-500" />
          <span class="text-sm text-amber-700 font-semibold dark:text-amber-400">Environment Setup Required</span>
          <span class="ml-auto text-xs text-amber-500">Step 1 / 2</span>
        </div>
        <p class="mb-4 text-xs text-amber-600 leading-relaxed dark:text-amber-400/80">
          The AI singing module requires FFmpeg and a Python environment with PyTorch.
          Click the button below to automatically configure everything.
        </p>

        <!-- One-Click Setup Button -->
        <button
          :disabled="autoSetupRunning || (setupFFmpeg.running || setupPython.running)"
          class="mb-4 w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm text-white font-medium transition-all"
          :class="autoSetupRunning || setupFFmpeg.running || setupPython.running ? 'cursor-wait bg-blue-400' : 'bg-blue-500 shadow-sm hover:bg-blue-600 active:scale-[0.98]'"
          @click="startOneClickSetup"
        >
          <div v-if="autoSetupRunning || setupFFmpeg.running || setupPython.running" class="i-svg-spinners:ring-resize text-sm" />
          <div v-else class="i-solar:magic-stick-3-bold-duotone text-sm" />
          <span>{{ autoSetupRunning || setupFFmpeg.running || setupPython.running ? 'Setting up automatically...' : 'One-Click Setup All' }}</span>
        </button>

        <!-- FFmpeg Card -->
        <div class="mb-3 overflow-hidden border rounded-lg transition-colors" :class="health.ffmpeg ? 'border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-900/10' : 'border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800/50'">
          <div class="flex items-center justify-between p-3">
            <div class="flex items-center gap-2">
              <div :class="health.ffmpeg ? 'i-solar:check-circle-bold text-green-500' : 'i-solar:close-circle-bold text-red-500'" class="text-base" />
              <span class="text-sm font-medium" :class="health.ffmpeg ? 'text-green-700 dark:text-green-400' : 'text-neutral-700 dark:text-neutral-300'">FFmpeg</span>
              <span v-if="health.ffmpegPath" class="max-w-40 truncate text-xs text-neutral-400 font-mono">{{ health.ffmpegPath }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span v-if="setupFFmpeg.running && setupFFmpeg.startedAt" class="text-xs text-neutral-400 font-mono tabular-nums">{{ formatElapsed(setupFFmpeg.startedAt) }}</span>
              <button
                v-if="!health.ffmpeg"
                :disabled="setupFFmpeg.running"
                class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-white font-medium transition-all"
                :class="setupFFmpeg.running ? 'cursor-wait bg-blue-400' : 'bg-blue-500 hover:bg-blue-600 active:scale-95'"
                @click="startSetup('ffmpeg')"
              >
                <div v-if="setupFFmpeg.running" class="i-svg-spinners:ring-resize text-xs" />
                <div v-else class="i-solar:download-minimalistic-bold text-xs" />
                <span>{{ setupFFmpeg.running ? 'Installing...' : 'Auto Install' }}</span>
              </button>
            </div>
          </div>
          <div v-if="setupFFmpeg.running && setupFFmpeg.progress" class="px-3 pb-1">
            <div class="mb-1 flex items-center justify-between text-xs">
              <span class="truncate text-blue-600 dark:text-blue-400">{{ setupFFmpeg.progress.message }}</span>
              <span class="ml-2 shrink-0 text-neutral-400 font-mono tabular-nums">{{ setupFFmpeg.progress.percent }}%</span>
            </div>
            <div class="h-1.5 overflow-hidden rounded-full bg-blue-100 dark:bg-blue-900/30">
              <div class="h-full rounded-full bg-blue-500 transition-all duration-300" :style="{ width: `${setupFFmpeg.progress.percent}%` }" />
            </div>
          </div>
          <div v-if="setupFFmpeg.logs.length > 0" ref="ffmpegLogEl" class="max-h-36 overflow-y-auto border-t border-neutral-100 bg-neutral-950 px-3 py-2 text-xs leading-relaxed font-mono dark:border-neutral-800">
            <div v-for="(entry, i) in setupFFmpeg.logs" :key="i" class="flex gap-2">
              <span class="shrink-0 text-neutral-600 tabular-nums">{{ formatLogTs(entry.ts, setupFFmpeg.startedAt) }}</span>
              <span :class="{ 'text-green-400': entry.level === 'success', 'text-yellow-400': entry.level === 'warn', 'text-red-400': entry.level === 'error', 'text-neutral-400': entry.level === 'info' }">{{ entry.text }}</span>
            </div>
          </div>
          <p v-if="setupFFmpeg.error" class="px-3 pb-2 text-xs text-red-600 dark:text-red-400">
            {{ setupFFmpeg.error }}
          </p>
        </div>

        <!-- Python Card -->
        <div class="mb-3 overflow-hidden border rounded-lg transition-colors" :class="health.pythonVenv ? 'border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-900/10' : 'border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800/50'">
          <div class="flex items-center justify-between p-3">
            <div class="flex items-center gap-2">
              <div :class="health.pythonVenv ? 'i-solar:check-circle-bold text-green-500' : 'i-solar:close-circle-bold text-red-500'" class="text-base" />
              <span class="text-sm font-medium" :class="health.pythonVenv ? 'text-green-700 dark:text-green-400' : 'text-neutral-700 dark:text-neutral-300'">Python Environment</span>
              <span v-if="health.pythonVenv && health.pythonPath" class="max-w-40 truncate text-xs text-neutral-400 font-mono">{{ health.pythonPath }}</span>
              <span v-else-if="health.pythonVenvExists && !health.pythonPackagesInstalled" class="text-xs text-amber-500">(packages incomplete)</span>
              <span v-else-if="health.python && !health.pythonVenv" class="text-xs text-amber-500">(venv needed)</span>
            </div>
            <div class="flex items-center gap-2">
              <span v-if="setupPython.running && setupPython.startedAt" class="text-xs text-neutral-400 font-mono tabular-nums">{{ formatElapsed(setupPython.startedAt) }}</span>
              <button
                v-if="!health.pythonVenv"
                :disabled="setupPython.running || (!health.python && !health.uvAvailable)"
                class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-white font-medium transition-all"
                :class="setupPython.running ? 'cursor-wait bg-blue-400' : (!health.python && !health.uvAvailable) ? 'cursor-not-allowed bg-neutral-400' : 'bg-blue-500 hover:bg-blue-600 active:scale-95'"
                @click="startSetup('python')"
              >
                <div v-if="setupPython.running" class="i-svg-spinners:ring-resize text-xs" />
                <div v-else class="i-solar:download-minimalistic-bold text-xs" />
                <span>{{ setupPython.running ? 'Setting up...' : 'Auto Setup' }}</span>
              </button>
            </div>
          </div>
          <p v-if="!health.python && !health.uvAvailable && !health.pythonVenv" class="px-3 pb-2 text-xs text-red-600 dark:text-red-400">
            Neither Python nor uv found. Please install
            <a href="https://docs.astral.sh/uv/getting-started/installation/" target="_blank" class="underline">uv</a> or
            <a href="https://www.python.org/downloads/" target="_blank" class="underline">Python 3.10+</a> first.
          </p>
          <p v-else-if="health.pythonVenvExists && !health.pythonPackagesInstalled && health.pythonPackagesMissing.length > 0" class="px-3 pb-2 text-xs text-amber-600 dark:text-amber-400">
            venv exists but missing packages: {{ health.pythonPackagesMissing.join(', ') }}. Click setup to install them.
          </p>
          <div v-if="setupPython.running && setupPython.progress" class="px-3 pb-1">
            <div class="mb-1 flex items-center justify-between text-xs">
              <span class="truncate text-blue-600 dark:text-blue-400">{{ setupPython.progress.message }}</span>
              <span class="ml-2 shrink-0 text-neutral-400 font-mono tabular-nums">{{ setupPython.progress.percent }}%</span>
            </div>
            <div class="h-1.5 overflow-hidden rounded-full bg-blue-100 dark:bg-blue-900/30">
              <div class="h-full rounded-full bg-blue-500 transition-all duration-300" :style="{ width: `${setupPython.progress.percent}%` }" />
            </div>
          </div>
          <div v-if="setupPython.logs.length > 0" ref="pythonLogEl" class="max-h-36 overflow-y-auto border-t border-neutral-100 bg-neutral-950 px-3 py-2 text-xs leading-relaxed font-mono dark:border-neutral-800">
            <div v-for="(entry, i) in setupPython.logs" :key="i" class="flex gap-2">
              <span class="shrink-0 text-neutral-600 tabular-nums">{{ formatLogTs(entry.ts, setupPython.startedAt) }}</span>
              <span :class="{ 'text-green-400': entry.level === 'success', 'text-yellow-400': entry.level === 'warn', 'text-red-400': entry.level === 'error', 'text-neutral-400': entry.level === 'info' }">{{ entry.text }}</span>
            </div>
          </div>
          <p v-if="setupPython.error" class="px-3 pb-2 text-xs text-red-600 dark:text-red-400">
            {{ setupPython.error }}
          </p>
        </div>

        <!-- Re-check -->
        <div class="flex items-center justify-between">
          <span class="text-xs text-neutral-400 dark:text-neutral-500">Already installed manually?</span>
          <button class="flex items-center gap-1.5 rounded-lg bg-neutral-100 px-3 py-1.5 text-xs text-neutral-600 font-medium transition-colors dark:bg-neutral-800 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-700" @click="retrySetup">
            <div class="i-solar:refresh-bold text-sm" />
            Re-check
          </button>
        </div>
      </div>
    </div>

    <!-- Step 2: Base Models Download -->
    <div v-else-if="needsBaseModels" class="flex flex-col gap-4">
      <div class="border border-amber-200 rounded-xl bg-amber-50/80 p-5 dark:border-amber-800 dark:bg-amber-900/20">
        <div class="mb-3 flex items-center gap-2">
          <div class="i-solar:database-bold-duotone text-xl text-amber-500" />
          <span class="text-sm text-amber-700 font-semibold dark:text-amber-400">Base Models Required</span>
          <span class="ml-auto text-xs text-amber-500">Step 2 / 2</span>
        </div>
        <p class="mb-3 text-xs text-amber-600 leading-relaxed dark:text-amber-400/80">
          The pipeline requires {{ baseModelsSummary.total }} base models for vocal separation, pitch extraction, content encoding, and voice training.
          <span v-if="baseModelsSummary.missing > 0" class="font-medium">
            {{ baseModelsSummary.missing }} model(s) need to be downloaded (~{{ formatFileSize(baseModelsSummary.totalSize) }}).
          </span>
        </p>

        <!-- One-Click Download -->
        <button
          v-if="!setupModels.running"
          class="mb-4 w-full flex items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2.5 text-sm text-white font-medium shadow-sm transition-all active:scale-[0.98] hover:bg-blue-600"
          @click="startSetup('models')"
        >
          <div class="i-solar:download-minimalistic-bold text-sm" />
          <span>Download All Missing Models (~{{ formatFileSize(baseModelsSummary.totalSize) }})</span>
        </button>

        <!-- Per-category model checklist -->
        <div class="mb-4 space-y-3">
          <div v-for="(group, cat) in baseModelsByCategory" :key="cat">
            <p class="mb-1.5 text-xs text-neutral-500 font-medium dark:text-neutral-400">
              {{ group.label }}
            </p>
            <div class="space-y-1">
              <div v-for="m in group.models" :key="m.id" class="flex items-center gap-2 rounded-md px-2.5 py-1.5" :class="m.exists ? 'bg-green-50 dark:bg-green-900/10' : m.actualSize > 0 ? 'bg-amber-50 dark:bg-amber-900/10' : 'bg-neutral-50 dark:bg-neutral-800/40'">
                <div :class="m.exists ? 'i-solar:check-circle-bold text-green-500' : m.actualSize > 0 ? 'i-solar:danger-triangle-bold text-amber-500' : 'i-solar:clock-circle-bold text-neutral-400'" class="shrink-0 text-sm" />
                <span class="text-xs font-medium" :class="m.exists ? 'text-green-700 dark:text-green-400' : 'text-neutral-600 dark:text-neutral-300'">{{ m.name }}</span>
                <span class="text-xs text-neutral-400">{{ m.description }}</span>
                <span v-if="!m.exists && m.actualSize > 0" class="text-xs text-amber-500">(incomplete: {{ formatFileSize(m.actualSize) }})</span>
                <span class="ml-auto shrink-0 text-xs text-neutral-400 font-mono">{{ formatFileSize(m.sizeBytes) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Download button -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span v-if="setupModels.running && setupModels.startedAt" class="text-xs text-neutral-400 font-mono tabular-nums">
              {{ formatElapsed(setupModels.startedAt) }}
            </span>
          </div>
          <button
            :disabled="setupModels.running"
            class="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs text-white font-medium transition-all"
            :class="setupModels.running ? 'cursor-wait bg-blue-400' : 'bg-blue-500 hover:bg-blue-600 active:scale-95'"
            @click="startSetup('models')"
          >
            <div v-if="setupModels.running" class="i-svg-spinners:ring-resize text-xs" />
            <div v-else class="i-solar:download-minimalistic-bold text-xs" />
            <span>{{ setupModels.running ? 'Downloading...' : `Download ${baseModelsSummary.missing} Missing Model(s)` }}</span>
          </button>
        </div>

        <!-- Download progress -->
        <div v-if="setupModels.running && setupModels.progress" class="mt-3">
          <div class="mb-1 flex items-center justify-between text-xs">
            <span class="truncate text-blue-600 dark:text-blue-400">{{ setupModels.progress.message }}</span>
            <span class="ml-2 shrink-0 text-neutral-400 font-mono tabular-nums">{{ setupModels.progress.percent }}%</span>
          </div>
          <div class="h-2 overflow-hidden rounded-full bg-blue-100 dark:bg-blue-900/30">
            <div class="h-full rounded-full bg-blue-500 transition-all duration-300" :style="{ width: `${setupModels.progress.percent}%` }" />
          </div>
        </div>

        <!-- Download logs -->
        <div v-if="setupModels.logs.length > 0" ref="modelsLogEl" class="mt-3 max-h-48 overflow-y-auto border border-neutral-100 rounded-lg bg-neutral-950 px-3 py-2 text-xs leading-relaxed font-mono dark:border-neutral-800">
          <div v-for="(entry, i) in setupModels.logs" :key="i" class="flex gap-2">
            <span class="shrink-0 text-neutral-600 tabular-nums">{{ formatLogTs(entry.ts, setupModels.startedAt) }}</span>
            <span :class="{ 'text-green-400': entry.level === 'success', 'text-yellow-400': entry.level === 'warn', 'text-red-400': entry.level === 'error', 'text-neutral-400': entry.level === 'info' }">{{ entry.text }}</span>
          </div>
        </div>
        <p v-if="setupModels.error" class="mt-2 text-xs text-red-600 dark:text-red-400">
          {{ setupModels.error }}
        </p>
      </div>
    </div>

    <!-- Everything Ready -->
    <template v-if="allReady">
      <!-- Status bar -->
      <div class="flex items-center gap-3 border border-green-200 rounded-xl bg-green-50/50 px-4 py-2.5 dark:border-green-800 dark:bg-green-900/10">
        <div class="i-solar:check-circle-bold text-base text-green-500" />
        <span class="text-xs text-green-700 font-medium dark:text-green-400">All Systems Ready</span>
        <div class="flex-1" />
        <div class="flex items-center gap-3 text-xs text-neutral-400">
          <span class="flex items-center gap-1"><div class="i-solar:video-frame-play-vertical-bold-duotone text-xs" /> FFmpeg</span>
          <span class="flex items-center gap-1"><div class="i-solar:code-bold-duotone text-xs" /> Python</span>
          <span class="flex items-center gap-1"><div class="i-solar:database-bold-duotone text-xs" /> {{ baseModelsSummary.total }} Models</span>
        </div>
      </div>

      <!-- Voice models card -->
      <div class="border border-neutral-200 rounded-xl p-4 dark:border-neutral-700">
        <div class="mb-2 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class="i-solar:microphone-3-bold-duotone text-base text-neutral-500" />
            <span class="text-sm text-neutral-700 font-medium dark:text-neutral-300">Voice Models</span>
          </div>
          <span v-if="voiceModels.length > 0" class="text-xs text-neutral-400">{{ voiceModels.length }} available</span>
        </div>

        <div v-if="modelsLoading" class="flex items-center gap-2 py-2 text-xs text-neutral-400">
          <div class="i-svg-spinners:ring-resize" /><span>Loading voice models...</span>
        </div>
        <div v-else-if="voiceModels.length > 0" class="flex flex-wrap gap-1.5">
          <span
            v-for="vm in voiceModels" :key="vm.name"
            class="flex items-center gap-1 rounded-md bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
          >
            <div class="i-solar:microphone-bold text-xs" />
            {{ vm.name }}
            <span v-if="vm.hasIndex" class="text-green-500" title="Has retrieval index">+idx</span>
            <span
              v-if="vm.grade"
              class="rounded px-1 py-px text-[10px] font-bold"
              :class="{
                'bg-green-200 text-green-800 dark:bg-green-900/50 dark:text-green-400': vm.grade === 'A',
                'bg-blue-200 text-blue-800 dark:bg-blue-900/50 dark:text-blue-400': vm.grade === 'B',
                'bg-amber-200 text-amber-800 dark:bg-amber-900/50 dark:text-amber-400': vm.grade === 'C',
                'bg-orange-200 text-orange-800 dark:bg-orange-900/50 dark:text-orange-400': vm.grade === 'D',
                'bg-red-200 text-red-800 dark:bg-red-900/50 dark:text-red-400': vm.grade === 'F',
              }"
              :title="`Quality grade: ${vm.grade}`"
            >
              {{ vm.grade }}
            </span>
          </span>
        </div>
        <div v-else class="py-2">
          <p class="text-xs text-neutral-400">
            No voice models yet. Train a new voice in the "Voice Training" tab, or place <code class="rounded bg-neutral-100 px-1 py-0.5 dark:bg-neutral-800">*.pth</code> files in:
          </p>
          <p v-if="health.modelsDir" class="mt-1 text-xs text-neutral-500 font-mono">
            {{ health.modelsDir }}
          </p>
        </div>
      </div>

      <!-- Tab Bar -->
      <div class="flex gap-1 border-b border-neutral-200 dark:border-neutral-700">
        <button
          class="border-b-2 px-4 py-2 text-sm font-medium transition-colors"
          :class="activeTab === 'cover' ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400'"
          @click="activeTab = 'cover'"
        >
          <div class="flex items-center gap-1.5">
            <div class="i-solar:music-note-slider-2-bold-duotone text-base" /><span>AI Cover</span>
          </div>
        </button>
        <button
          class="border-b-2 px-4 py-2 text-sm font-medium transition-colors"
          :class="activeTab === 'training' ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400'"
          @click="activeTab = 'training'"
        >
          <div class="flex items-center gap-1.5">
            <div class="i-solar:cpu-bolt-bold-duotone text-base" /><span>Voice Training</span>
          </div>
        </button>
      </div>

      <!-- Cover -->
      <div v-show="activeTab === 'cover'" class="flex flex-col gap-5">
        <CoverForm :voice-models="voiceModels" :models-loading="modelsLoading" @refresh-models="loadModels" />
        <JobProgress
          v-if="coverStore.status !== 'idle'"
          :job-id="coverStore.currentJobId"
          :status="coverStore.status"
          :current-stage="coverStore.currentStage"
          :progress="coverStore.progress"
          :error="coverStore.error"
          :started-at="coverStore.startedAt"
          :can-cancel="coverStore.canCancel"
          @cancel="() => void coverRuntime.cancelActiveJob()"
        />
        <ArtifactPlayer
          v-if="coverStore.isCompleted"
          :final-cover-url="artifactsStore.finalCoverUrl"
          :vocals-url="artifactsStore.vocalsUrl"
          :instrumental-url="artifactsStore.instrumentalUrl"
          :converted-vocals-url="artifactsStore.convertedVocalsUrl"
        />
      </div>

      <!-- Training -->
      <div v-show="activeTab === 'training'" class="flex flex-col gap-5">
        <TrainingPanel />
      </div>
    </template>
  </div>
</template>
