<script setup lang="ts">
import type { DockConfig, DockDebugState, WindowTargetSummary } from '@proj-airi/electron-window-dock'

import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { defaultDockConfig, windowDock } from '@proj-airi/electron-window-dock'
import { Button, FieldCheckbox, FieldInput, FieldRange } from '@proj-airi/ui'
import { watchDebounced } from '@vueuse/core'
import { clamp } from 'es-toolkit/math'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

const fetchTargets = useElectronEventaInvoke(windowDock.listTargets)
const beginDock = useElectronEventaInvoke(windowDock.start)
const endDock = useElectronEventaInvoke(windowDock.stop)
const readConfig = useElectronEventaInvoke(windowDock.getConfig)
const updateConfig = useElectronEventaInvoke(windowDock.setConfig)
const readDebugState = useElectronEventaInvoke(windowDock.getDebugState)

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
/** The shortest refresh interval of the window list. The description of the number field shows it. */
const MIN_TARGET_REFRESH_INTERVAL_MS = 300

const MIN_VIEWPORT_SPAN_PERCENT = 1

function createDefaultConfig(): Required<DockConfig> {
  return {
    ...defaultDockConfig,
    viewport: { ...defaultDockConfig.viewport },
  }
}

/**
 * The time after the last option edit before the page applies the options.
 * Thus a slider drag or a typed number sends one update, not one update for each step.
 */
const APPLY_DELAY_MS = 300
/** The ID of the toast for apply results. A new result replaces the previous toast, so fast edits do not stack toasts. */
const APPLY_TOAST_ID = 'window-dock-options'

/** The option fields. Each edit applies after {@link APPLY_DELAY_MS}. */
const config = reactive<Required<DockConfig>>(createDefaultConfig())
/** The options that the main process runs, as JSON. The page sends an update only when the fields differ from it. */
let appliedConfigJson = JSON.stringify(config)

const debugPollHandle = ref<number>()
const targetPollHandle = ref<number>()

const clampPercent = (value?: number) => clamp(Math.round(value ?? 0), 0, 100)

function updateViewportPercent(partial: Partial<{ left: number, right: number, top: number, bottom: number }>) {
  const current = config.viewport
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
  get: () => Math.round(config.viewport.left * 100),
  set: value => updateViewportPercent({ left: value }),
})

const horizontalEnd = computed({
  get: () => Math.round(config.viewport.right * 100),
  set: value => updateViewportPercent({ right: value }),
})

const verticalStart = computed({
  get: () => Math.round(config.viewport.top * 100),
  set: value => updateViewportPercent({ top: value }),
})

const verticalEnd = computed({
  get: () => Math.round(config.viewport.bottom * 100),
  set: value => updateViewportPercent({ bottom: value }),
})

const viewportPreviewStyle = computed(() => ({
  left: `${horizontalStart.value}%`,
  right: `${100 - horizontalEnd.value}%`,
  top: `${verticalStart.value}%`,
  bottom: `${100 - verticalEnd.value}%`,
}))

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

async function refreshTargets(options?: { silent?: boolean }) {
  if (isRefreshingTargets.value)
    return

  const silent = options?.silent === true

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
    // An edit inside the apply delay applies before the session starts.
    // If the main process rejects it, the toast shows the reason, and the session uses the running options.
    await applyConfig()
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

/**
 * Reads the running options into the fields. Without this, the fields show the defaults after the page opens again,
 * and the first edit sends the defaults for all other options.
 */
async function loadConfig() {
  try {
    Object.assign(config, await readConfig())
  }
  catch (error) {
    // The fields keep the defaults. An edit then sends the defaults with the edit.
    toast.error('Cannot read the dock options', { id: APPLY_TOAST_ID, description: errorMessageFrom(error) ?? 'Unknown error' })
  }
  appliedConfigJson = JSON.stringify(config)
}

/**
 * Sends the option fields to the main process when they differ from the running options.
 * The main process validates the whole update. If it rejects the update, the running options do not change,
 * and the toast shows the validation error. The fields keep the invalid value, so that the user can correct it.
 */
async function applyConfig() {
  const json = JSON.stringify(config)
  if (json === appliedConfigJson)
    return

  try {
    // A reactive proxy cannot go through IPC, so the update is a plain copy.
    debugState.value = await updateConfig({ ...config, viewport: { ...config.viewport } })
    appliedConfigJson = json
    toast.success('Dock options applied', { id: APPLY_TOAST_ID })
  }
  catch (error) {
    toast.error('Dock options not applied', { id: APPLY_TOAST_ID, description: errorMessageFrom(error) ?? 'Unknown error' })
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
  // An empty number field gives `''`, and `setInterval` uses 0 ms for it. Such a value stops the refresh.
  const intervalMs = Number(targetRefreshIntervalMs.value)
  if (!autoRefreshTargets.value || !Number.isFinite(intervalMs) || intervalMs < MIN_TARGET_REFRESH_INTERVAL_MS)
    return

  targetPollHandle.value = window.setInterval(() => {
    refreshTargets({ silent: true })
  }, intervalMs)
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

watchDebounced(config, applyConfig, { debounce: APPLY_DELAY_MS, deep: true })

onMounted(() => {
  loadConfig()
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
      <Button
        label="Start Dock"
        icon="i-solar:play-line-duotone"
        color="primary"
        variant="primary"
        :disabled="isLoading || !selectedTargetId"
        @click="startDock"
      />
      <Button
        label="Stop"
        icon="i-solar:stop-line-duotone"
        @click="stopDock"
      />
      <Button
        :label="isLoading ? 'Refreshing…' : 'Refresh targets'"
        icon="i-solar:refresh-line-duotone"
        :disabled="isLoading"
        @click="refreshTargets()"
      />
      <div v-if="status" :class="['text-sm', 'text-amber-500']">
        {{ status }}
      </div>
    </div>

    <div :class="['grid', 'grid-cols-1', 'gap-4', 'md:grid-cols-3']">
      <FieldCheckbox
        v-model="filterOnScreenOnly"
        label="Only on-screen windows"
        description="Leaves hidden and minimized windows out of the list."
      />
      <FieldCheckbox
        v-model="autoRefreshTargets"
        label="Auto refresh"
        description="Reads the window list again at the interval."
      />
      <FieldInput
        v-model="targetRefreshIntervalMs"
        type="number"
        label="Refresh interval (ms)"
        :description="`At least ${MIN_TARGET_REFRESH_INTERVAL_MS} ms.`"
        :disabled="!autoRefreshTargets"
      />
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
          <div :class="['mb-3', 'text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
            Each option applies automatically after an edit. A toast shows the result.
          </div>
          <div :class="['flex', 'flex-col', 'gap-4']">
            <div :class="['grid', 'grid-cols-1', 'gap-4', 'sm:grid-cols-3']">
              <FieldInput
                v-model="config.activeIntervalMs"
                type="number"
                label="Active (ms)"
                description="16 to 60000."
              />
              <FieldInput
                v-model="config.hiddenIntervalMs"
                type="number"
                label="Hidden (ms)"
                description="100 to 60000."
              />
              <FieldInput
                v-model="config.padding"
                type="number"
                label="Padding (px)"
                description="0 to 500."
              />
            </div>
            <FieldCheckbox
              v-model="config.clickThrough"
              label="Click-through"
              description="Mouse clicks go through AIRI to the target window."
            />
          </div>
        </div>

        <div :class="['rounded-xl', 'border', 'border-neutral-200/70', 'bg-neutral-50/60', 'p-4', 'dark:border-neutral-800', 'dark:bg-neutral-900/60']">
          <div :class="['mb-2', 'text-sm', 'font-semibold']">
            Viewport & visibility
          </div>
          <div :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
            Limit AIRI to a sub-area of the target window, and choose when it hides.
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

          <div :class="['mt-3', 'flex', 'flex-col', 'gap-4', 'rounded-lg', 'border', 'border-neutral-200/70', 'bg-white/50', 'p-3', 'dark:border-neutral-800', 'dark:bg-neutral-950/30']">
            <FieldCheckbox
              v-model="config.hideWhenNotFrontmost"
              label="Hide when the target is not frontmost"
              description="A hidden, minimized, or fullscreen target always hides AIRI, whatever this option is."
            />
            <FieldCheckbox
              v-model="config.hideOnHover"
              label="Hide near the cursor"
              description="AIRI hides while the cursor is on the character or near it, and shows again when the cursor moves away."
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
