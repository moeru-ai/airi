<script setup lang="ts">
import { WidgetStage } from '@proj-airi/stage-ui/components/scenes'
import { useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'
import { useSettingsStageModel } from '@proj-airi/stage-ui/stores/settings'
import { useElectronWindowBounds } from '@proj-airi/tauri-vueuse'
import { computed, onMounted, ref } from 'vue'

import { useStageWindowLifecycleStore } from './stores/stage-window-lifecycle'

const runtime = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window ? 'Tauri' : 'Browser'
const stageReady = ref(false)
const windowBounds = runtime === 'Tauri' ? useElectronWindowBounds() : undefined
const boundsStatus = computed(() => {
  if (!windowBounds) return 'browser'
  return `${windowBounds.x.value}, ${windowBounds.y.value}, ${windowBounds.width.value} x ${windowBounds.height.value}`
})

const displayModelsStore = useDisplayModelsStore()
const settingsStageModelStore = useSettingsStageModel()
const stageWindowLifecycleStore = useStageWindowLifecycleStore()
const lifecycleStatus = computed(() => {
  const state = stageWindowLifecycleStore.windowLifecycle
  return `${state.reason}; focused=${state.focused}; minimized=${state.minimized}; visible=${state.visible}`
})

onMounted(async () => {
  if (runtime === 'Tauri') {
    await stageWindowLifecycleStore.initializeWindowLifecycleBridge()
  }

  await displayModelsStore.initialize()
  await displayModelsStore.loadDisplayModelsFromIndexedDB()
  await settingsStageModelStore.initializeStageModel()
  stageReady.value = true
})
</script>

<template>
  <main class="shell">
    <section class="stage-shell" aria-label="AIRI character stage">
      <WidgetStage v-if="stageReady" class="stage" />
      <div class="status-panel">
        <p class="eyebrow">AIRI</p>
        <h1>Character stage</h1>
        <p class="status">Runtime: {{ runtime }}</p>
        <p class="status status-compact">Bounds: {{ boundsStatus }}</p>
        <p class="status status-compact">Lifecycle: {{ lifecycleStatus }}</p>
      </div>
    </section>
  </main>
</template>
