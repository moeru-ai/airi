<script setup lang="ts">
import type { DockConfig, DockDebugState, WindowTargetSummary } from '@proj-airi/electron-window-dock'

import { defineInvoke } from '@moeru/eventa'
import { useElectronWindowDock } from '@proj-airi/electron-window-dock/vue'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { FieldCheckbox, FieldRange } from '@proj-airi/ui'
import { clamp } from 'es-toolkit/math'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

import { dockOverlaySyncTheme } from '../../../shared/eventa'
import { useElectronEventaContext } from '../../composables/electron-vueuse'

const { fetchTargets, beginDock, endDock, updateConfig, readDebugState } = useElectronWindowDock(window.electron.ipcRenderer)
const settings = useSettings()
const { themeColorsHue, themeColorsHueDynamic } = storeToRefs(settings)
const eventaContext = useElectronEventaContext()
const syncDockOverlayTheme = defineInvoke(eventaContext.value, dockOverlaySyncTheme)

const allTargets = ref<WindowTargetSummary[]>([])
const targets = ref<WindowTargetSummary[]>([])
const selectedTargetId = ref<string>()
const debugState = ref<DockDebugState>()
const isLoading = ref(false)
const isRefreshingTargets = ref(false)
const status = ref<string>()

const filterOnScreenOnly = ref(true)
const autoRefreshTargets = ref(true)
const targetRefreshIntervalMs = ref(1000)

const defaultViewport = {
  left: 0,
  right: 1,
  top: 0,
  bottom: 1,
} as const
const MIN_VIEWPORT_SPAN_PERCENT = 1

const config = reactive<DockConfig>({
  activeIntervalMs: 80,
  idleIntervalMs: 400,
  hiddenIntervalMs: 1000,
  padding: 0,
  clickThrough: true,
  hideWhenInactive: true,
  showWhenNotFrontmost: false,
  viewport: { ...defaultViewport },
})

const debugPollHandle = ref<number>()
const targetPollHandle = ref<number>()

const clampPercent = (value?: number) => clamp(Math.round(value ?? 0), 0, 100)

function updateViewportPercent(partial: Partial<{ left: number, right: number, top: number, bottom: number }>) {
  const current = config.viewport ?? { ...defaultViewport }
  const next = {
    left: clampPercent(partial.left ?? current.left * 100),
    right: clampPercent(partial.right ?? current.right * 100),
    top: clampPercent(partial.top ?? current.top * 100),
    bottom: clampPercent(partial.bottom ?? current.bottom * 100),
  }

  if (partial.left !== undefined && next.left >= next.right - MIN_VIEWPORT_SPAN_PERCENT)
    next.right = clamp(next.left + MIN_VIEWPORT_SPAN_PERCENT, 0, 100)
  if (partial.right !== undefined && next.right <= next.left + MIN_VIEWPORT_SPAN_PERCENT)
    next.left = clamp(next.right - MIN_VIEWPORT_SPAN_PERCENT, 0, 100)
  if (partial.top !== undefined && next.top >= next.bottom - MIN_VIEWPORT_SPAN_PERCENT)
    next.bottom = clamp(next.top + MIN_VIEWPORT_SPAN_PERCENT, 0, 100)
  if (partial.bottom !== undefined && next.bottom <= next.top + MIN_VIEWPORT_SPAN_PERCENT)
    next.top = clamp(next.bottom - MIN_VIEWPORT_SPAN_PERCENT, 0, 100)

  config.viewport = {
    left: next.left / 100,
    right: next.right / 100,
    top: next.top / 100,
    bottom: next.bottom / 100,
  }
}

const horizontalStart = computed({
  get: () => Math.round((config.viewport?.left ?? defaultViewport.left) * 100),
  set: value => updateViewportPercent({ left: value }),
})

const horizontalEnd = computed({
  get: () => Math.round((config.viewport?.right ?? defaultViewport.right) * 100),
  set: value => updateViewportPercent({ right: value }),
})

const verticalStart = computed({
  get: () => Math.round((config.viewport?.top ?? defaultViewport.top) * 100),
  set: value => updateViewportPercent({ top: value }),
})

const verticalEnd = computed({
  get: () => Math.round((config.viewport?.bottom ?? defaultViewport.bottom) * 100),
  set: value => updateViewportPercent({ bottom: value }),
})

const viewportPreviewStyle = computed(() => ({
  left: `${horizontalStart.value}%`,
  right: `${100 - horizontalEnd.value}%`,
  top: `${verticalStart.value}%`,
  bottom: `${100 - verticalEnd.value}%`,
}))

const showWhenNotFrontmost = computed({
  get: () => config.showWhenNotFrontmost ?? false,
  set: (value) => {
    config.showWhenNotFrontmost = value
  },
})

function formatPercent(value: number) {
  return `${Math.round(value)}%`
}

function applyTargetFilter(list: WindowTargetSummary[]) {
  allTargets.value = list
  const filtered = filterOnScreenOnly.value ? list.filter(window => window.isOnScreen) : list
  targets.value = filtered

  if (filtered.length > 0 && (!selectedTargetId.value || !filtered.some(window => window.id === selectedTargetId.value))) {
    selectedTargetId.value = filtered[0]!.id
  }
}

async function refreshTargets(options?: { silent?: boolean } | Event) {
  if (isRefreshingTargets.value)
    return

  const silent = typeof options === 'object' && options !== null && 'silent' in options
    ? (options as { silent?: boolean }).silent === true
    : false

  if (!silent) {
    isLoading.value = true
    status.value = undefined
  }

  isRefreshingTargets.value = true
  try {
    const list = await fetchTargets()
    applyTargetFilter(list)
  }
  catch (err) {
    console.error(err)
    if (!silent)
      status.value = 'Failed to fetch windows'
  }
  finally {
    if (!silent)
      isLoading.value = false
    isRefreshingTargets.value = false
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
    await syncDockOverlayTheme({
      hue: themeColorsHue.value,
      dynamic: themeColorsHueDynamic.value,
    })
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

function startTargetPolling() {
  stopTargetPolling()
  if (!autoRefreshTargets.value)
    return

  targetPollHandle.value = window.setInterval(() => {
    refreshTargets({ silent: true })
  }, targetRefreshIntervalMs.value)
}

function stopTargetPolling() {
  if (targetPollHandle.value) {
    window.clearInterval(targetPollHandle.value)
    targetPollHandle.value = undefined
  }
}

watch(filterOnScreenOnly, () => {
  applyTargetFilter(allTargets.value)
})

watch([autoRefreshTargets, targetRefreshIntervalMs], () => {
  startTargetPolling()
})

onMounted(() => {
  refreshTargets()
  refreshDebugState()
  startDebugPolling()
  startTargetPolling()
})

onBeforeUnmount(() => {
  stopDebugPolling()
  stopTargetPolling()
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

    <div :class="['flex', 'flex-wrap', 'items-center', 'gap-4', 'text-sm']">
      <label :class="['flex', 'items-center', 'gap-2']">
        <input
          v-model="filterOnScreenOnly"
          type="checkbox"
          :class="['h-4', 'w-4']"
        >
        <span>Only show on-screen windows</span>
      </label>
      <label :class="['flex', 'items-center', 'gap-2']">
        <input
          v-model="autoRefreshTargets"
          type="checkbox"
          :class="['h-4', 'w-4']"
        >
        <span>Auto refresh window list</span>
      </label>
      <label :class="['flex', 'items-center', 'gap-2']">
        <span :class="['text-2xs', 'text-neutral-500']">Interval (ms)</span>
        <input
          v-model.number="targetRefreshIntervalMs"
          type="number"
          min="300"
          step="100"
          :disabled="!autoRefreshTargets"
          :class="[
            'w-24', 'rounded-lg', 'border', 'border-neutral-300/70', 'bg-white/80', 'px-2', 'py-1.5',
            'disabled:opacity-60',
            'dark:border-neutral-700', 'dark:bg-neutral-950/60',
          ]"
        >
      </label>
    </div>

    <div :class="['grid', 'grid-cols-1', 'gap-3', 'md:grid-cols-2']">
      <div :class="['flex', 'flex-col', 'gap-3']">
        <div :class="['text-sm', 'font-semibold']">
          Window list (on-screen only by default; disable filter to include hidden windows)
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

        <div :class="['rounded-xl', 'border', 'border-neutral-200/70', 'bg-neutral-50/60', 'p-4', 'dark:border-neutral-800', 'dark:bg-neutral-900/60']">
          <div :class="['mb-2', 'text-sm', 'font-semibold']">
            Viewport & visibility
          </div>
          <div :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
            Limit AIRI to a sub-area of the target window and choose whether it stays visible when the window loses focus.
          </div>

          <div :class="['relative', 'mt-3', 'h-36', 'rounded-xl', 'border', 'border-dashed', 'border-neutral-300/70', 'bg-white/40', 'dark:border-neutral-800', 'dark:bg-neutral-950/20']">
            <div :class="['absolute', 'inset-2', 'rounded-lg', 'bg-neutral-200/50', 'dark:bg-neutral-800/40']" />
            <div
              :class="[
                'absolute', 'rounded-md',
                'border', 'border-primary-400/70',
                'bg-primary-500/15',
                'shadow-[0_0_0_1px_rgba(59,130,246,0.12)]',
                'transition-all',
              ]"
              :style="viewportPreviewStyle"
            />
            <div :class="['pointer-events-none', 'absolute', 'inset-0', 'flex', 'items-center', 'justify-center', 'text-2xs', 'uppercase', 'tracking-wide', 'text-neutral-400', 'dark:text-neutral-500']">
              Target window
            </div>
          </div>

          <div :class="['mt-4', 'flex', 'flex-col', 'gap-3']">
            <div :class="['text-xs', 'font-medium', 'text-neutral-600', 'dark:text-neutral-200']">
              Horizontal (%)
            </div>
            <div :class="['grid', 'grid-cols-2', 'gap-3']">
              <FieldRange
                v-model="horizontalStart"
                as="div"
                :min="0"
                :max="100"
                :step="1"
                label="Start"
                :format-value="formatPercent"
              />
              <FieldRange
                v-model="horizontalEnd"
                as="div"
                :min="0"
                :max="100"
                :step="1"
                label="End"
                :format-value="formatPercent"
              />
            </div>
          </div>

          <div :class="['mt-2', 'flex', 'flex-col', 'gap-3']">
            <div :class="['text-xs', 'font-medium', 'text-neutral-600', 'dark:text-neutral-200']">
              Vertical (%)
            </div>
            <div :class="['grid', 'grid-cols-2', 'gap-3']">
              <FieldRange
                v-model="verticalStart"
                as="div"
                :min="0"
                :max="100"
                :step="1"
                label="Top"
                :format-value="formatPercent"
              />
              <FieldRange
                v-model="verticalEnd"
                as="div"
                :min="0"
                :max="100"
                :step="1"
                label="Bottom"
                :format-value="formatPercent"
              />
            </div>
          </div>

          <div :class="['mt-3', 'rounded-lg', 'border', 'border-neutral-200/70', 'bg-white/50', 'p-3', 'dark:border-neutral-800', 'dark:bg-neutral-950/30']">
            <FieldCheckbox
              v-model="showWhenNotFrontmost"
              label="Show when target is not frontmost"
              description="Keeps AIRI visible even if other windows are on top. Still hides if the target is minimized, off-screen, or fullscreen."
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
  title: Dock Mode
  subtitleKey: tamagotchi.settings.devtools.title
</route>
