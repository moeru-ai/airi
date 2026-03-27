<script setup lang="ts">
import type { ModelSettingsRuntimeSnapshot } from './runtime'

import { Live2DScene, useLive2d } from '@proj-airi/stage-ui-live2d'
import { ThreeScene, useModelStore } from '@proj-airi/stage-ui-three'
import { useMouse } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'

import { useSettings } from '../../../../stores/settings'
import {
  createEmptyModelSettingsRuntimeSnapshot,
  resolveComponentStateToRuntimePhase,
} from './runtime'

const props = defineProps<{
  live2dSceneClass?: string | string[]
  vrmSceneClass?: string | string[]
}>()

const emit = defineEmits<{
  (e: 'runtimeSnapshotChanged', value: ModelSettingsRuntimeSnapshot): void
}>()

const positionCursor = useMouse()
const settingsStore = useSettings()
const live2dStore = useLive2d()
const modelStore = useModelStore()
const live2dSceneRef = ref<{ canvasElement: () => HTMLCanvasElement | undefined }>()
const vrmSceneRef = ref<{ canvasElement: () => HTMLCanvasElement | undefined }>()
const live2dComponentState = ref<'pending' | 'loading' | 'mounted'>('pending')
const vrmPreviewStageInstanceId = `model-settings-preview-stage:${Math.random().toString(36).slice(2, 10)}`

const {
  live2dDisableFocus,
  stageModelSelected,
  stageModelSelectedUrl,
  stageModelRenderer,
  themeColorsHue,
  themeColorsHueDynamic,
  live2dIdleAnimationEnabled,
  live2dAutoBlinkEnabled,
  live2dForceAutoBlinkEnabled,
  live2dShadowEnabled,
  live2dMaxFps,
} = storeToRefs(settingsStore)
const { scale: live2dScale } = storeToRefs(live2dStore)
const { sceneMutationLocked, scenePhase } = storeToRefs(modelStore)

const live2dSceneClassList = computed(() => normalizeClassList(props.live2dSceneClass))
const vrmSceneClassList = computed(() => normalizeClassList(props.vrmSceneClass))

function normalizeClassList(value?: string | string[]) {
  if (!value)
    return []

  return typeof value === 'string' ? [value] : value
}

function captureCanvasFrame(canvas?: HTMLCanvasElement) {
  return new Promise<Blob | undefined>((resolve) => {
    if (!canvas)
      return resolve(undefined)

    canvas.toBlob(blob => resolve(blob ?? undefined))
  })
}

async function capturePreviewFrame() {
  if (stageModelRenderer.value === 'live2d')
    return captureCanvasFrame(live2dSceneRef.value?.canvasElement())

  if (stageModelRenderer.value === 'vrm')
    return captureCanvasFrame(vrmSceneRef.value?.canvasElement())

  return undefined
}

const runtimeSnapshot = computed<ModelSettingsRuntimeSnapshot>(() => {
  const hasModel = !!stageModelSelectedUrl.value

  if (stageModelRenderer.value === 'live2d') {
    const phase = resolveComponentStateToRuntimePhase(live2dComponentState.value, { hasModel })

    return createEmptyModelSettingsRuntimeSnapshot({
      ownerInstanceId: vrmPreviewStageInstanceId,
      renderer: 'live2d',
      phase,
      controlsLocked: hasModel ? phase !== 'mounted' : false,
      previewAvailable: hasModel,
      canCapturePreview: !!live2dSceneRef.value?.canvasElement(),
      updatedAt: Date.now(),
    })
  }

  if (stageModelRenderer.value === 'vrm') {
    return createEmptyModelSettingsRuntimeSnapshot({
      ownerInstanceId: vrmPreviewStageInstanceId,
      renderer: 'vrm',
      phase: hasModel ? scenePhase.value : 'no-model',
      controlsLocked: hasModel ? sceneMutationLocked.value : false,
      previewAvailable: hasModel,
      canCapturePreview: !!vrmSceneRef.value?.canvasElement(),
      updatedAt: Date.now(),
    })
  }

  return createEmptyModelSettingsRuntimeSnapshot({
    ownerInstanceId: vrmPreviewStageInstanceId,
    updatedAt: Date.now(),
  })
})

watch(runtimeSnapshot, snapshot => emit('runtimeSnapshotChanged', snapshot), { immediate: true })

defineExpose({
  capturePreviewFrame,
})
</script>

<template>
  <template v-if="stageModelRenderer === 'live2d'">
    <div :class="live2dSceneClassList">
      <Live2DScene
        ref="live2dSceneRef"
        v-model:state="live2dComponentState"
        :focus-at="{ x: positionCursor.x.value, y: positionCursor.y.value }"
        :model-src="stageModelSelectedUrl"
        :model-id="stageModelSelected"
        :disable-focus-at="live2dDisableFocus"
        :scale="live2dScale"
        :theme-colors-hue="themeColorsHue"
        :theme-colors-hue-dynamic="themeColorsHueDynamic"
        :live2d-idle-animation-enabled="live2dIdleAnimationEnabled"
        :live2d-auto-blink-enabled="live2dAutoBlinkEnabled"
        :live2d-force-auto-blink-enabled="live2dForceAutoBlinkEnabled"
        :live2d-shadow-enabled="live2dShadowEnabled"
        :live2d-max-fps="live2dMaxFps"
      />
    </div>
  </template>
  <template v-if="stageModelRenderer === 'vrm'">
    <div :class="vrmSceneClassList">
      <ThreeScene ref="vrmSceneRef" :model-src="stageModelSelectedUrl" />
    </div>
  </template>
</template>
