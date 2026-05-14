<script setup lang="ts">
import type { Rect } from './desktop-overlay-coordinates'
/**
 * Desktop Overlay — transparent fullscreen overlay for ghost pointer visualization.
 *
 * This page is loaded in the desktop-overlay BrowserWindow (transparent, click-through).
 * It polls the MCP state via `computer_use::desktop_get_state` to render:
 * - Ghost pointer dot at the snap-resolved position
 * - Bounding box around matched target candidates
 * - Source label + confidence badge
 * - Stale indicators when grounding snapshot is outdated
 *
 * Core logic lives in desktop-overlay-polling.ts (testable without DOM).
 * Coordinate mapping lives in desktop-overlay-coordinates.ts (testable without DOM).
 * This component is a thin reactive shell over those modules.
 */
import type { OverlayState } from './desktop-overlay-polling'

import { electron } from '@proj-airi/electron-eventa'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import { electronMcpApplyAndRestart, electronMcpCallTool, electronMcpGetRuntimeStatus, electronMcpListTools, getDesktopOverlayReadinessContract } from '../../shared/eventa'
import { pointInOverlay, rectIntersectsOverlay, screenRectToLocal, screenToLocal } from './desktop-overlay-coordinates'
import { createEmptyOverlayState, createOverlayPollController, formatOverlayPollHeartbeat, isOverlayPollHeartbeatEnabled } from './desktop-overlay-polling'

declare global {
  interface Window {
    __AIRI_DESKTOP_OVERLAY_SMOKE__?: {
      applyAndRestartMcp: () => Promise<unknown>
      callMcpTool: (payload: { name: string, arguments?: Record<string, unknown> }) => Promise<unknown>
      getMcpRuntimeStatus: () => Promise<unknown>
      getOverlayState: () => OverlayState
      getReadiness: () => Promise<{ state: 'booting' | 'ready' | 'degraded', error?: string }>
      listMcpTools: () => Promise<unknown>
    }
  }
}

// ---------------------------------------------------------------------------
// Overlay window bounds — read once on mount from main process
// ---------------------------------------------------------------------------

const getWindowBounds = useElectronEventaInvoke(electron.window.getBounds)
const getReadiness = useElectronEventaInvoke(getDesktopOverlayReadinessContract)
const applyAndRestartMcp = useElectronEventaInvoke(electronMcpApplyAndRestart)
const callMcpTool = useElectronEventaInvoke(electronMcpCallTool)
const getMcpRuntimeStatus = useElectronEventaInvoke(electronMcpGetRuntimeStatus)
const listMcpTools = useElectronEventaInvoke(electronMcpListTools)
const overlayBounds = ref<Rect | null>(null)
const pollHeartbeatEnabled = isOverlayPollHeartbeatEnabled()

// ---------------------------------------------------------------------------
// Reactive state — single ref driven by poll controller
// ---------------------------------------------------------------------------

const state = ref<OverlayState>(createEmptyOverlayState())

// Filtered & mapped candidates: only those intersecting the overlay, with local coords
const visibleCandidates = computed(() => {
  if (!overlayBounds.value || !state.value.hasSnapshot)
    return []
  const ob = overlayBounds.value
  return state.value.candidates
    .filter(c => rectIntersectsOverlay(c.bounds, ob))
    .map(c => ({
      ...c,
      localBounds: screenRectToLocal(c.bounds, ob),
    }))
})

const pointerIntent = computed(() => state.value.pointerIntent)
const hasSnapshot = computed(() => state.value.hasSnapshot)
const isStale = computed(() =>
  state.value.staleFlags.screenshot
  || state.value.staleFlags.ax
  || state.value.staleFlags.chromeSemantic,
)

// Match candidate for pointer intent bounding box
const matchedCandidate = computed(() => {
  if (!pointerIntent.value?.candidateId)
    return null
  return visibleCandidates.value.find(c => c.id === pointerIntent.value!.candidateId) ?? null
})

// ---------------------------------------------------------------------------
// Polling controller
// ---------------------------------------------------------------------------

const controller = createOverlayPollController({
  callTool: name => callMcpTool({ name }),
  getReadiness: async () => getReadiness(),
  onState: (newState) => {
    state.value = newState
  },
  onHeartbeat: pollHeartbeatEnabled
    ? heartbeat => console.info(formatOverlayPollHeartbeat(heartbeat))
    : undefined,
})

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

function sourceColor(source: string): string {
  switch (source) {
    case 'chrome_dom': return '#22c55e'
    case 'ax': return '#f59e0b'
    case 'vision': return '#8b5cf6'
    default: return '#6b7280'
  }
}

const pointerPhase = computed(() => pointerIntent.value?.phase ?? 'preview')
const executionResult = computed(() => pointerIntent.value?.executionResult)

function phaseColor(phase: string, result?: string): { bg: string, shadow: string } {
  if (phase === 'completed') {
    switch (result) {
      case 'success': return { bg: '#22c55e', shadow: 'rgba(34, 197, 94, 0.5)' }
      case 'fallback': return { bg: '#f59e0b', shadow: 'rgba(245, 158, 11, 0.5)' }
      case 'error': return { bg: '#ef4444', shadow: 'rgba(239, 68, 68, 0.5)' }
      default: return { bg: '#6b7280', shadow: 'rgba(107, 114, 128, 0.5)' }
    }
  }
  if (phase === 'executing') {
    return { bg: '#ef4444', shadow: 'rgba(239, 68, 68, 0.6)' }
  }
  // preview / default
  return { bg: '#3b82f6', shadow: 'rgba(59, 130, 246, 0.5)' }
}

const pointerStyle = computed(() => {
  if (!pointerIntent.value || !overlayBounds.value)
    return { display: 'none' }
  const ob = overlayBounds.value
  const screenPoint = pointerIntent.value.snappedPoint
  if (!pointInOverlay(screenPoint, ob))
    return { display: 'none' }
  const local = screenToLocal(screenPoint, ob)
  const phase = pointerPhase.value
  const colors = phaseColor(phase, executionResult.value)
  return {
    left: `${local.x - 8}px`,
    top: `${local.y - 8}px`,
    display: 'block',
    backgroundColor: colors.bg,
    boxShadow: `0 0 12px 4px ${colors.shadow}`,
  }
})

// Click ripple — shown briefly when phase transitions to 'completed'
const showRipple = ref(false)
const rippleStyle = computed(() => {
  if (!pointerIntent.value || !overlayBounds.value || !showRipple.value)
    return { display: 'none' }
  const ob = overlayBounds.value
  const screenPoint = pointerIntent.value.snappedPoint
  if (!pointInOverlay(screenPoint, ob))
    return { display: 'none' }
  const local = screenToLocal(screenPoint, ob)
  const colors = phaseColor('completed', executionResult.value)
  return {
    left: `${local.x - 20}px`,
    top: `${local.y - 20}px`,
    display: 'block',
    borderColor: colors.bg,
  }
})

// Watch for phase changes to trigger ripple
watch(pointerPhase, (newPhase) => {
  if (newPhase === 'completed') {
    showRipple.value = true
    setTimeout(() => { showRipple.value = false }, 600)
  }
})

const targetBoxStyle = computed(() => {
  if (!matchedCandidate.value)
    return { display: 'none' }
  const { localBounds } = matchedCandidate.value
  return {
    left: `${localBounds.x}px`,
    top: `${localBounds.y}px`,
    width: `${localBounds.width}px`,
    height: `${localBounds.height}px`,
    display: 'block',
  }
})

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

onMounted(async () => {
  // Read overlay window bounds from main process (one-time)
  try {
    const bounds = await getWindowBounds()
    overlayBounds.value = bounds
  }
  catch {
    // Fallback: assume bounds start at (0,0) with window inner size
    overlayBounds.value = {
      x: 0,
      y: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    }
  }

  if (pollHeartbeatEnabled) {
    window.__AIRI_DESKTOP_OVERLAY_SMOKE__ = {
      applyAndRestartMcp,
      callMcpTool,
      getMcpRuntimeStatus,
      getOverlayState: () => state.value,
      getReadiness,
      listMcpTools,
    }
  }

  controller.start()
})

onUnmounted(() => {
  controller.stop()
  delete window.__AIRI_DESKTOP_OVERLAY_SMOKE__
})
</script>

<template>
  <div :class="['desktop-overlay']">
    <!-- Stale badge -->
    <div
      v-if="hasSnapshot && isStale"
      :class="['stale-badge']"
    >
      ⚠ STALE
    </div>

    <!-- Ghost pointer dot -->
    <div
      v-if="pointerIntent"
      :class="[
        'ghost-pointer',
        pointerPhase === 'executing' && 'ghost-pointer--executing',
        pointerPhase === 'completed' && 'ghost-pointer--completed',
      ]"
      :style="pointerStyle"
    />

    <!-- Click ripple (brief expanding ring on click completion) -->
    <div
      v-if="showRipple"
      :class="['click-ripple']"
      :style="rippleStyle"
    />

    <!-- Target bounding box (matched candidate from pointer intent) -->
    <div
      v-if="matchedCandidate"
      :class="['target-box']"
      :style="targetBoxStyle"
    >
      <span
        :class="['target-label']"
        :style="{ borderColor: sourceColor(matchedCandidate.source) }"
      >
        {{ matchedCandidate.source }} · {{ matchedCandidate.label }}
        <span :class="['confidence-badge']">
          {{ Math.round(matchedCandidate.confidence * 100) }}%
        </span>
      </span>
    </div>

    <!-- All candidate boxes -->
    <template v-if="hasSnapshot && visibleCandidates.length > 0">
      <div
        v-for="candidate in visibleCandidates"
        :key="candidate.id"
        :class="['candidate-box']"
        :style="{
          left: `${candidate.localBounds.x}px`,
          top: `${candidate.localBounds.y}px`,
          width: `${candidate.localBounds.width}px`,
          height: `${candidate.localBounds.height}px`,
          borderColor: sourceColor(candidate.source),
          opacity: isStale ? 0.3 : 1,
        }"
      >
        <span :class="['candidate-label']">
          {{ candidate.id }}
        </span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.desktop-overlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 999999;
}

.stale-badge {
  position: fixed;
  top: 8px;
  right: 8px;
  font: bold 11px/1 system-ui, sans-serif;
  color: #fbbf24;
  background: rgba(0, 0, 0, 0.7);
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid rgba(251, 191, 36, 0.5);
  z-index: 20;
}

.ghost-pointer {
  position: absolute;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  transition: left 0.15s ease, top 0.15s ease, background-color 0.2s ease, box-shadow 0.2s ease;
  z-index: 10;
}

/* Pulsing animation when the agent is executing a click */
.ghost-pointer--executing {
  animation: ghost-pulse 0.6s ease-in-out infinite;
}

/* Fade out after execution completes */
.ghost-pointer--completed {
  animation: ghost-fadeout 0.8s ease-out forwards;
}

@keyframes ghost-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.4); opacity: 0.7; }
}

@keyframes ghost-fadeout {
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.2); opacity: 0.6; }
  100% { transform: scale(0.8); opacity: 0; }
}

/* Expanding ring ripple on click */
.click-ripple {
  position: absolute;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 2px solid;
  animation: ripple-expand 0.6s ease-out forwards;
  pointer-events: none;
  z-index: 9;
}

@keyframes ripple-expand {
  0% { transform: scale(0.5); opacity: 1; }
  100% { transform: scale(2); opacity: 0; }
}

.target-box {
  position: absolute;
  border: 2px solid rgba(59, 130, 246, 0.6);
  border-radius: 4px;
  background: rgba(59, 130, 246, 0.08);
  z-index: 5;
}

.target-label {
  position: absolute;
  top: -24px;
  left: 0;
  font: 11px/1.2 system-ui, sans-serif;
  color: #fff;
  background: rgba(0, 0, 0, 0.7);
  padding: 2px 6px;
  border-radius: 3px;
  border-left: 3px solid;
  white-space: nowrap;
}

.confidence-badge {
  display: inline-block;
  margin-left: 4px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.7);
}

.candidate-box {
  position: absolute;
  border: 1px dashed;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.04);
  z-index: 3;
  transition: opacity 0.3s ease;
}

.candidate-label {
  position: absolute;
  top: -16px;
  left: 0;
  font: 10px/1 monospace;
  color: #fff;
  background: rgba(0, 0, 0, 0.6);
  padding: 1px 4px;
  border-radius: 2px;
}
</style>
