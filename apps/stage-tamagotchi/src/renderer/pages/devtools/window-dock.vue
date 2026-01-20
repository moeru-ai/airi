<script setup lang="ts">
import type { DockConfig, DockDebugState, WindowTargetSummary } from '@proj-airi/electron-window-dock'

import { useElectronWindowDock } from '@proj-airi/electron-window-dock/vue'
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'

const { fetchTargets, beginDock, endDock, updateConfig, readDebugState } = useElectronWindowDock(window.electron.ipcRenderer)

const targets = ref<WindowTargetSummary[]>([])
const selectedTargetId = ref<string>()
const debugState = ref<DockDebugState>()
const isLoading = ref(false)
const status = ref<string>()

const config = reactive<DockConfig>({
  activeIntervalMs: 80,
  idleIntervalMs: 400,
  hiddenIntervalMs: 1000,
  padding: 0,
  clickThrough: true,
  hideWhenInactive: true,
})

const debugPollHandle = ref<number>()

async function refreshTargets() {
  isLoading.value = true
  status.value = undefined
  try {
    targets.value = await fetchTargets()
    if (!selectedTargetId.value && targets.value.length > 0) {
      selectedTargetId.value = targets.value[0]!.id
    }
  }
  catch (err) {
    console.error(err)
    status.value = 'Failed to fetch windows'
  }
  finally {
    isLoading.value = false
  }
}

async function refreshDebugState() {
  try {
    debugState.value = await readDebugState()
  }
  catch (err) {
    console.error(err)
  }
}

async function startDock() {
  if (!selectedTargetId.value) {
    status.value = 'Pick a target window before starting Dock Mode.'
    return
  }
  status.value = undefined

  try {
    debugState.value = await beginDock({ targetId: selectedTargetId.value })
  }
  catch (err) {
    console.error(err)
    status.value = 'Failed to start dock.'
  }
}

async function stopDock() {
  try {
    debugState.value = await endDock()
  }
  catch (err) {
    console.error(err)
    status.value = 'Failed to stop dock.'
  }
}

async function pushConfig() {
  try {
    debugState.value = await updateConfig({ ...config })
  }
  catch (err) {
    console.error(err)
    status.value = 'Failed to update config.'
  }
}

function startDebugPolling() {
  stopDebugPolling()
  debugPollHandle.value = window.setInterval(() => {
    refreshDebugState()
  }, 1000)
}

function stopDebugPolling() {
  if (debugPollHandle.value) {
    window.clearInterval(debugPollHandle.value)
    debugPollHandle.value = undefined
  }
}

onMounted(() => {
  refreshTargets()
  refreshDebugState()
  startDebugPolling()
})

onBeforeUnmount(() => {
  stopDebugPolling()
})
</script>

<template>
  <div :class="['flex', 'flex-col', 'gap-4', 'text-neutral-500', 'dark:text-neutral-300']">
    <div :class="['flex', 'items-center', 'gap-3', 'flex-wrap']">
      <button
        :class="[
          'rounded-lg', 'px-3', 'py-2',
          'bg-primary-500/90', 'text-white', 'font-semibold',
          'hover:bg-primary-500', 'transition-colors',
          'disabled:opacity-60', 'disabled:cursor-not-allowed',
        ]"
        :disabled="isLoading || !selectedTargetId"
        @click="startDock"
      >
        Start Dock
      </button>
      <button
        :class="[
          'rounded-lg', 'px-3', 'py-2',
          'border', 'border-neutral-300/60', 'bg-neutral-50/60',
          'hover:border-neutral-400', 'hover:bg-neutral-50/80',
          'dark:border-neutral-700', 'dark:bg-neutral-900/70', 'dark:hover:border-neutral-500',
        ]"
        @click="stopDock"
      >
        Stop
      </button>
      <button
        :class="[
          'rounded-lg', 'px-3', 'py-2',
          'border', 'border-neutral-300/60', 'bg-neutral-50/60',
          'hover:border-neutral-400', 'hover:bg-neutral-50/80',
          'dark:border-neutral-700', 'dark:bg-neutral-900/70', 'dark:hover:border-neutral-500',
        ]"
        :disabled="isLoading"
        @click="refreshTargets"
      >
        {{ isLoading ? 'Refreshing…' : 'Refresh targets' }}
      </button>
      <div v-if="status" :class="['text-sm', 'text-amber-500']">
        {{ status }}
      </div>
    </div>

    <div :class="['grid', 'grid-cols-1', 'gap-3', 'md:grid-cols-2']">
      <div :class="['flex', 'flex-col', 'gap-3']">
        <div :class="['text-sm', 'font-semibold']">
          On-screen windows (fallback: Electron windows only)
        </div>
        <div
          v-if="targets.length === 0"
          :class="[
            'rounded-lg', 'border', 'border-dashed', 'border-neutral-300/70',
            'bg-neutral-50/40', 'p-3', 'text-sm',
            'dark:border-neutral-700', 'dark:bg-neutral-900/60',
          ]"
        >
          No windows discovered yet. Try refreshing after opening a window.
        </div>
        <div v-else :class="['flex', 'flex-col', 'gap-2']">
          <div
            v-for="target in targets"
            :key="target.id"
            :class="[
              'cursor-pointer', 'rounded-xl', 'border', 'p-3',
              selectedTargetId === target.id
                ? 'border-primary-400 bg-primary-400/10 dark:border-primary-400/80 dark:bg-primary-500/10'
                : 'border-neutral-200/60 bg-neutral-50/50 dark:border-neutral-800 dark:bg-neutral-900/40',
            ]"
            @click="selectedTargetId = target.id"
          >
            <div :class="['flex', 'items-center', 'justify-between', 'gap-2']">
              <div :class="['text-base', 'font-semibold', 'text-neutral-800', 'dark:text-neutral-100']">
                {{ target.title || 'Untitled window' }}
              </div>
              <div
                :class="[
                  'rounded-full', 'px-2', 'py-0.5', 'text-2xs', 'font-semibold',
                  target.isOnScreen ? 'bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-neutral-500/15 text-neutral-500',
                ]"
              >
                {{ target.isOnScreen ? 'On screen' : 'Hidden' }}
              </div>
            </div>
            <div :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
              {{ target.appName || 'app' }} · PID {{ target.ownerPid ?? 'n/a' }} · Layer {{ target.layer ?? 'n/a' }}
            </div>
            <div :class="['mt-1', 'text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
              Bounds: {{ target.bounds.x }}, {{ target.bounds.y }} — {{ target.bounds.width }}×{{ target.bounds.height }}
            </div>
            <div v-if="target.isFullscreen" :class="['mt-1', 'text-2xs', 'text-amber-500']">
              Fullscreen heuristic matched
            </div>
          </div>
        </div>
      </div>

      <div :class="['flex', 'flex-col', 'gap-3']">
        <div :class="['rounded-xl', 'border', 'border-neutral-200/70', 'bg-neutral-50/60', 'p-4', 'dark:border-neutral-800', 'dark:bg-neutral-900/60']">
          <div :class="['mb-2', 'text-sm', 'font-semibold']">
            Debug
          </div>
          <div :class="['grid', 'grid-cols-2', 'gap-2', 'text-sm']">
            <div>
              <div :class="['text-neutral-400', 'text-2xs']">
                State
              </div>
              <div>{{ debugState?.state ?? 'unknown' }}</div>
            </div>
            <div>
              <div :class="['text-neutral-400', 'text-2xs']">
                Poll interval
              </div>
              <div>{{ debugState?.pollIntervalMs ?? '—' }} ms</div>
            </div>
            <div>
              <div :class="['text-neutral-400', 'text-2xs']">
                Reason
              </div>
              <div>{{ debugState?.lastReason ?? '—' }}</div>
            </div>
            <div>
              <div :class="['text-neutral-400', 'text-2xs']">
                Windows above
              </div>
              <div>{{ debugState?.windowsAbove ?? 0 }}</div>
            </div>
            <div>
              <div :class="['text-neutral-400', 'text-2xs']">
                Target
              </div>
              <div>{{ debugState?.targetId ?? 'none' }}</div>
            </div>
            <div>
              <div :class="['text-neutral-400', 'text-2xs']">
                Last update
              </div>
              <div>{{ debugState?.lastUpdatedAt ? new Date(debugState.lastUpdatedAt).toLocaleTimeString() : '—' }}</div>
            </div>
          </div>
          <div v-if="debugState?.lastMeta" :class="['mt-3', 'rounded-lg', 'border', 'border-neutral-200/60', 'bg-white/50', 'p-3', 'text-xs', 'dark:border-neutral-800', 'dark:bg-neutral-950/30']">
            <div :class="['mb-1', 'text-[11px]', 'font-semibold', 'uppercase', 'tracking-wide']">
              Last meta
            </div>
            <div>On screen: {{ debugState.lastMeta.isOnScreen }}</div>
            <div>Minimized: {{ debugState.lastMeta.isMinimized ?? false }}</div>
            <div>Layer: {{ debugState.lastMeta.layer ?? 'n/a' }}</div>
            <div>Bounds: {{ debugState.lastMeta.bounds.x }}, {{ debugState.lastMeta.bounds.y }} — {{ debugState.lastMeta.bounds.width }}×{{ debugState.lastMeta.bounds.height }}</div>
          </div>
        </div>

        <div :class="['rounded-xl', 'border', 'border-neutral-200/70', 'bg-neutral-50/60', 'p-4', 'dark:border-neutral-800', 'dark:bg-neutral-900/60']">
          <div :class="['mb-2', 'text-sm', 'font-semibold']">
            Polling config
          </div>
          <div :class="['grid', 'grid-cols-2', 'gap-2', 'text-sm']">
            <label :class="['flex', 'flex-col', 'gap-1']">
              <span :class="['text-2xs', 'text-neutral-500']">Active (ms)</span>
              <input
                v-model.number="config.activeIntervalMs"
                type="number"
                min="16"
                step="10"
                :class="[
                  'rounded-lg', 'border', 'border-neutral-300/70', 'bg-white/80', 'px-3', 'py-2',
                  'dark:border-neutral-700', 'dark:bg-neutral-950/60',
                ]"
              >
            </label>
            <label :class="['flex', 'flex-col', 'gap-1']">
              <span :class="['text-2xs', 'text-neutral-500']">Idle (ms)</span>
              <input
                v-model.number="config.idleIntervalMs"
                type="number"
                min="50"
                step="10"
                :class="[
                  'rounded-lg', 'border', 'border-neutral-300/70', 'bg-white/80', 'px-3', 'py-2',
                  'dark:border-neutral-700', 'dark:bg-neutral-950/60',
                ]"
              >
            </label>
            <label :class="['flex', 'flex-col', 'gap-1']">
              <span :class="['text-2xs', 'text-neutral-500']">Hidden (ms)</span>
              <input
                v-model.number="config.hiddenIntervalMs"
                type="number"
                min="100"
                step="10"
                :class="[
                  'rounded-lg', 'border', 'border-neutral-300/70', 'bg-white/80', 'px-3', 'py-2',
                  'dark:border-neutral-700', 'dark:bg-neutral-950/60',
                ]"
              >
            </label>
            <label :class="['flex', 'flex-col', 'gap-1']">
              <span :class="['text-2xs', 'text-neutral-500']">Padding (px)</span>
              <input
                v-model.number="config.padding"
                type="number"
                min="0"
                step="1"
                :class="[
                  'rounded-lg', 'border', 'border-neutral-300/70', 'bg-white/80', 'px-3', 'py-2',
                  'dark:border-neutral-700', 'dark:bg-neutral-950/60',
                ]"
              >
            </label>
          </div>
          <label :class="['mt-2', 'flex', 'items-center', 'gap-2', 'text-sm']">
            <input
              v-model="config.clickThrough"
              type="checkbox"
              :class="['h-4', 'w-4']"
            >
            <span>Enable click-through</span>
          </label>
          <label :class="['mt-1', 'flex', 'items-center', 'gap-2', 'text-sm']">
            <input
              v-model="config.hideWhenInactive"
              type="checkbox"
              :class="['h-4', 'w-4']"
            >
            <span>Hide overlay when target is not frontmost/fullscreen</span>
          </label>
          <button
            :class="[
              'mt-3', 'rounded-lg', 'px-3', 'py-2',
              'bg-primary-500/90', 'text-white', 'font-semibold',
              'hover:bg-primary-500', 'transition-colors',
            ]"
            @click="pushConfig"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  title: Dock Mode
  subtitleKey: tamagotchi.settings.devtools.title
</route>
