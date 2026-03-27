<script setup lang="ts">
import { ButtonBar } from '@proj-airi/stage-ui/components'
import { storeToRefs } from 'pinia'
import { onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

import { useStageThreeRuntimeDiagnosticsStore } from '../../stores/stage-three-runtime-diagnostics'
import { useStageWindowLifecycleStore } from '../../stores/stage-window-lifecycle'

const { t } = useI18n()
const diagnostics = useStageThreeRuntimeDiagnosticsStore()
const windowLifecycleStore = useStageWindowLifecycleStore()
const {
  hitTest,
  resourceSnapshots,
  threeRender,
  tracing,
  vrmLifecycle,
  vrmUpdate,
} = storeToRefs(diagnostics)
const {
  stagePaused,
  windowLifecycle,
} = storeToRefs(windowLifecycleStore)

onMounted(() => {
  diagnostics.startTracing()
})

onUnmounted(() => {
  diagnostics.stopTracing()
})

function formatFloat(value?: number, digits = 2) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toFixed(digits)
    : 'n/a'
}

function formatCount(value?: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : 'n/a'
}
</script>

<template>
  <div :class="['flex flex-col gap-4', 'pb-6']">
    <div :class="['flex items-center gap-2']">
      <ButtonBar
        :icon="tracing ? 'i-solar:stop-circle-bold-duotone' : 'i-solar:play-circle-bold-duotone'"
        :text="tracing ? 'Stage Three Runtime tracing enabled' : 'Stage Three Runtime tracing disabled'"
        @click="tracing ? diagnostics.stopTracing() : diagnostics.startTracing()"
      >
        {{ tracing ? 'Stop tracing' : 'Start tracing' }}
      </ButtonBar>
    </div>

    <div :class="['grid gap-3', 'md:grid-cols-2']">
      <section :class="['rounded-2xl border border-neutral-700/60', 'bg-neutral-950/40 p-4']">
        <div :class="['mb-2 text-sm text-neutral-400']">
          Window lifecycle
        </div>
        <div :class="['grid gap-1 text-sm text-neutral-100']">
          <div>visible: {{ windowLifecycle.visible }}</div>
          <div>minimized: {{ windowLifecycle.minimized }}</div>
          <div>focused: {{ windowLifecycle.focused }}</div>
          <div>reason: {{ windowLifecycle.reason }}</div>
          <div>updatedAt: {{ windowLifecycle.updatedAt }}</div>
          <div>stagePaused: {{ stagePaused }}</div>
        </div>
      </section>

      <section :class="['rounded-2xl border border-neutral-700/60', 'bg-neutral-950/40 p-4']">
        <div :class="['mb-2 text-sm text-neutral-400']">
          Three render
        </div>
        <div :class="['grid gap-1 text-sm text-neutral-100']">
          <div>renderCount: {{ threeRender.renderCount }}</div>
          <div>drawCalls: {{ threeRender.drawCalls }}</div>
          <div>triangles: {{ threeRender.triangles }}</div>
          <div>points: {{ threeRender.points }}</div>
          <div>lines: {{ threeRender.lines }}</div>
          <div>textures: {{ threeRender.textures }}</div>
          <div>geometries: {{ threeRender.geometries }}</div>
          <div>lastTimestampMs: {{ threeRender.lastTimestampMs.toFixed(2) }}</div>
        </div>
      </section>

      <section :class="['rounded-2xl border border-neutral-700/60', 'bg-neutral-950/40 p-4']">
        <div :class="['mb-2 text-sm text-neutral-400']">
          VRM update frame
        </div>
        <div :class="['grid gap-1 text-sm text-neutral-100']">
          <div>frameCount: {{ vrmUpdate.frameCount }}</div>
          <div>totalMs: {{ vrmUpdate.totalMs.toFixed(3) }}</div>
          <div>deltaMs: {{ vrmUpdate.deltaMs.toFixed(3) }}</div>
          <div>animationMixerMs: {{ vrmUpdate.animationMixerMs.toFixed(3) }}</div>
          <div>humanoidMs: {{ vrmUpdate.humanoidMs.toFixed(3) }}</div>
          <div>lookAtMs: {{ vrmUpdate.lookAtMs.toFixed(3) }}</div>
          <div>blinkAndSaccadeMs: {{ vrmUpdate.blinkAndSaccadeMs.toFixed(3) }}</div>
          <div>emoteMs: {{ vrmUpdate.emoteMs.toFixed(3) }}</div>
          <div>lipSyncMs: {{ vrmUpdate.lipSyncMs.toFixed(3) }}</div>
          <div>expressionMs: {{ vrmUpdate.expressionMs.toFixed(3) }}</div>
          <div>springBoneMs: {{ vrmUpdate.springBoneMs.toFixed(3) }}</div>
          <div>vrmFrameHookMs: {{ vrmUpdate.vrmFrameHookMs.toFixed(3) }}</div>
        </div>
      </section>

      <section :class="['rounded-2xl border border-neutral-700/60', 'bg-neutral-950/40 p-4']">
        <div :class="['mb-2 text-sm text-neutral-400']">
          Fade-on-hover hit test
        </div>
        <div :class="['grid gap-1 text-sm text-neutral-100']">
          <div>readCount: {{ hitTest.readCount }}</div>
          <div>lastDurationMs: {{ hitTest.lastDurationMs.toFixed(3) }}</div>
          <div>totalDurationMs: {{ hitTest.totalDurationMs.toFixed(3) }}</div>
          <div>lastReadWidth: {{ hitTest.lastReadWidth }}</div>
          <div>lastReadHeight: {{ hitTest.lastReadHeight }}</div>
          <div>lastTimestampMs: {{ hitTest.lastTimestampMs.toFixed(2) }}</div>
        </div>
      </section>

      <section :class="['rounded-2xl border border-neutral-700/60', 'bg-neutral-950/40 p-4']">
        <div :class="['mb-2 text-sm text-neutral-400']">
          VRM lifecycle
        </div>
        <div :class="['grid gap-1 text-sm text-neutral-100']">
          <div>lastModelSrc: {{ vrmLifecycle.lastModelSrc || 'n/a' }}</div>
          <div>lastReason: {{ vrmLifecycle.lastReason || 'n/a' }}</div>
          <div>lastLoadStartAt: {{ vrmLifecycle.lastLoadStartAt.toFixed(2) }}</div>
          <div>lastLoadEndAt: {{ vrmLifecycle.lastLoadEndAt.toFixed(2) }}</div>
          <div>lastLoadDurationMs: {{ vrmLifecycle.lastLoadDurationMs.toFixed(3) }}</div>
          <div>lastDisposeStartAt: {{ vrmLifecycle.lastDisposeStartAt.toFixed(2) }}</div>
          <div>lastDisposeEndAt: {{ vrmLifecycle.lastDisposeEndAt.toFixed(2) }}</div>
          <div>lastDisposeDurationMs: {{ vrmLifecycle.lastDisposeDurationMs.toFixed(3) }}</div>
          <div>lastErrorMessage: {{ vrmLifecycle.lastErrorMessage || 'n/a' }}</div>
        </div>
      </section>

      <section :class="['rounded-2xl border border-neutral-700/60', 'bg-neutral-950/40 p-4', 'md:col-span-2']">
        <div :class="['mb-2 text-sm text-neutral-400']">
          Renderer / resource snapshots
        </div>
        <div :class="['grid gap-3 text-sm text-neutral-100', 'md:grid-cols-3']">
          <div>
            <div :class="['mb-1 text-xs text-neutral-400 uppercase tracking-wide']">
              after load
            </div>
            <div>ts: {{ formatFloat(resourceSnapshots.lastAfterLoad?.ts) }}</div>
            <div>textures: {{ formatCount(resourceSnapshots.lastAfterLoad?.rendererMemory?.textures) }}</div>
            <div>geometries: {{ formatCount(resourceSnapshots.lastAfterLoad?.rendererMemory?.geometries) }}</div>
            <div>calls: {{ formatCount(resourceSnapshots.lastAfterLoad?.rendererMemory?.calls) }}</div>
            <div>meshCount: {{ formatCount(resourceSnapshots.lastAfterLoad?.sceneSummary?.meshCount) }}</div>
            <div>materialCount: {{ formatCount(resourceSnapshots.lastAfterLoad?.sceneSummary?.materialCount) }}</div>
          </div>
          <div>
            <div :class="['mb-1 text-xs text-neutral-400 uppercase tracking-wide']">
              before dispose
            </div>
            <div>ts: {{ formatFloat(resourceSnapshots.lastBeforeDispose?.ts) }}</div>
            <div>textures: {{ formatCount(resourceSnapshots.lastBeforeDispose?.rendererMemory?.textures) }}</div>
            <div>geometries: {{ formatCount(resourceSnapshots.lastBeforeDispose?.rendererMemory?.geometries) }}</div>
            <div>calls: {{ formatCount(resourceSnapshots.lastBeforeDispose?.rendererMemory?.calls) }}</div>
            <div>meshCount: {{ formatCount(resourceSnapshots.lastBeforeDispose?.sceneSummary?.meshCount) }}</div>
            <div>materialCount: {{ formatCount(resourceSnapshots.lastBeforeDispose?.sceneSummary?.materialCount) }}</div>
          </div>
          <div>
            <div :class="['mb-1 text-xs text-neutral-400 uppercase tracking-wide']">
              after dispose
            </div>
            <div>ts: {{ formatFloat(resourceSnapshots.lastAfterDispose?.ts) }}</div>
            <div>textures: {{ formatCount(resourceSnapshots.lastAfterDispose?.rendererMemory?.textures) }}</div>
            <div>geometries: {{ formatCount(resourceSnapshots.lastAfterDispose?.rendererMemory?.geometries) }}</div>
            <div>calls: {{ formatCount(resourceSnapshots.lastAfterDispose?.rendererMemory?.calls) }}</div>
            <div>meshCount: {{ formatCount(resourceSnapshots.lastAfterDispose?.sceneSummary?.meshCount) }}</div>
            <div>materialCount: {{ formatCount(resourceSnapshots.lastAfterDispose?.sceneSummary?.materialCount) }}</div>
          </div>
        </div>

        <div :class="['mt-3 text-xs text-neutral-400']">
          history entries: {{ resourceSnapshots.history.length }}
        </div>
      </section>
    </div>

    <div :class="['text-sm text-neutral-400']">
      {{ t('tamagotchi.settings.devtools.pages.performance-visualizer.description') }}
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: tamagotchi.settings.devtools.pages.performance-visualizer.title
  subtitleKey: tamagotchi.settings.devtools.title
</route>
