<script setup lang="ts">
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
 * This component is a thin reactive shell over that module.
 */
import type { OverlayState } from './desktop-overlay-polling'

import { getMcpToolBridge } from '@proj-airi/stage-ui/stores/mcp-tool-bridge'
import { computed, onMounted, onUnmounted, ref } from 'vue'

import { createEmptyOverlayState, createOverlayPollController } from './desktop-overlay-polling'

// ---------------------------------------------------------------------------
// Reactive state — single ref driven by poll controller
// ---------------------------------------------------------------------------

const state = ref<OverlayState>(createEmptyOverlayState())

const candidates = computed(() => state.value.candidates)
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
  return candidates.value.find(c => c.id === pointerIntent.value!.candidateId) ?? null
})

// ---------------------------------------------------------------------------
// Polling controller
// ---------------------------------------------------------------------------

let bridgeAvailable = false

const controller = createOverlayPollController({
  callTool: async (name) => {
    // Probe bridge availability lazily
    if (!bridgeAvailable) {
      getMcpToolBridge() // Throws if not set
      bridgeAvailable = true
    }
    return getMcpToolBridge().callTool({ name })
  },
  onState: (newState) => {
    state.value = newState
  },
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

const pointerStyle = computed(() => {
  if (!pointerIntent.value)
    return { display: 'none' }
  const { snappedPoint, mode } = pointerIntent.value
  const isExecute = mode === 'execute'
  return {
    left: `${snappedPoint.x - 8}px`,
    top: `${snappedPoint.y - 8}px`,
    display: 'block',
    backgroundColor: isExecute ? '#ef4444' : '#3b82f6',
    boxShadow: isExecute
      ? '0 0 12px 4px rgba(239, 68, 68, 0.5)'
      : '0 0 12px 4px rgba(59, 130, 246, 0.5)',
  }
})

const targetBoxStyle = computed(() => {
  if (!matchedCandidate.value)
    return { display: 'none' }
  const { bounds } = matchedCandidate.value
  return {
    left: `${bounds.x}px`,
    top: `${bounds.y}px`,
    width: `${bounds.width}px`,
    height: `${bounds.height}px`,
    display: 'block',
  }
})

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

onMounted(() => {
  controller.start()
})

onUnmounted(() => {
  controller.stop()
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
      :class="['ghost-pointer']"
      :style="pointerStyle"
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
    <template v-if="hasSnapshot && candidates.length > 0">
      <div
        v-for="candidate in candidates"
        :key="candidate.id"
        :class="['candidate-box']"
        :style="{
          left: `${candidate.bounds.x}px`,
          top: `${candidate.bounds.y}px`,
          width: `${candidate.bounds.width}px`,
          height: `${candidate.bounds.height}px`,
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
  transition: left 0.15s ease, top 0.15s ease;
  z-index: 10;
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
