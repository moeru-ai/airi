<script setup lang="ts">
import type { ModelSettingsRuntimeSnapshot } from './runtime'

import { ref } from 'vue'

import ModelSettingsPanel from './panel.vue'
import ModelSettingsPreviewStage from './preview-stage.vue'

import { createEmptyModelSettingsRuntimeSnapshot } from './runtime'

withDefaults(defineProps<{
  palette: string[]
  settingsClass?: string | string[]
  allowExtractColors?: boolean
  live2dSceneClass?: string | string[]
  vrmSceneClass?: string | string[]
}>(), {
  allowExtractColors: true,
})

defineEmits<{
  (e: 'extractColorsFromModel'): void
}>()

const previewStageRef = ref<{ capturePreviewFrame: () => Promise<Blob | undefined> }>()
const runtimeSnapshot = ref<ModelSettingsRuntimeSnapshot>(createEmptyModelSettingsRuntimeSnapshot())

async function capturePreviewFrame() {
  return previewStageRef.value?.capturePreviewFrame()
}

function handleRuntimeSnapshotChanged(nextSnapshot: ModelSettingsRuntimeSnapshot) {
  runtimeSnapshot.value = nextSnapshot
}

defineExpose({
  capturePreviewFrame,
})
</script>

<template>
  <ModelSettingsPanel
    :allow-extract-colors="allowExtractColors"
    :palette="palette"
    :runtime-snapshot="runtimeSnapshot"
    :settings-class="settingsClass"
    @extract-colors-from-model="$emit('extractColorsFromModel')"
  />
  <ModelSettingsPreviewStage
    ref="previewStageRef"
    :live2d-scene-class="live2dSceneClass"
    :vrm-scene-class="vrmSceneClass"
    @runtime-snapshot-changed="handleRuntimeSnapshotChanged"
  />
</template>
