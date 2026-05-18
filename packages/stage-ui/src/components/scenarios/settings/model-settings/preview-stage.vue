<script setup lang="ts">
import type { ModelSettingsRuntimeSnapshot } from './runtime'

import { Live2DScene, useSettingsLive2d } from '@proj-airi/stage-ui-live2d'
import { SpineScene } from '@proj-airi/stage-ui-spine'
import { ThreeScene, useModelStore } from '@proj-airi/stage-ui-three'
import { storeToRefs } from 'pinia'
import { computed, provide, ref, watch } from 'vue'

import { useSettings } from '../../../../stores/settings'
import {
  createEmptyModelSettingsRuntimeSnapshot,
  resolveComponentStateToRuntimePhase,
} from './runtime'

const props = defineProps<{
  live2dSceneClass?: string | string[]
  vrmSceneClass?: string | string[]
  spineSceneClass?: string | string[]
}>()

const emit = defineEmits<{
  (e: 'runtimeSnapshotChanged', value: ModelSettingsRuntimeSnapshot): void
}>()

const settingsStore = useSettings()
const l2dSettings = useSettingsLive2d()
const modelStore = useModelStore()
const live2dSceneRef = ref<{ canvasElement: () => HTMLCanvasElement | undefined }>()
const vrmSceneRef = ref<{ canvasElement: () => HTMLCanvasElement | undefined }>()
const spineSceneRef = ref<{ canvasElement: () => HTMLCanvasElement | undefined }>()
const live2dComponentState = ref<'pending' | 'loading' | 'mounted'>('pending')
const spineComponentState = ref<'pending' | 'loading' | 'mounted'>('pending')
const vrmPreviewStageInstanceId = `model-settings-preview-stage:${Math.random().toString(36).slice(2, 10)}`

provide('previewStage', true)

const {
  stageModelSelected,
  stageModelSelectedUrl,
  stageModelRenderer,
  themeColorsHue,
  themeColorsHueDynamic,

} = storeToRefs(settingsStore)
const {
  live2dCursorTracking,
  live2dIdleAnimationEnabled,
  live2dForceIdleEyeAnimation,
  live2dAutoBlinkEnabled,
  live2dForceAutoBlinkEnabled,
  live2dShadowEnabled,
  live2dMaxFps,
  live2dRenderScale,
} = storeToRefs(l2dSettings)
const {
  spinePremultipliedAlpha,
  spineDefaultMixDuration,
  spineIdleAnimationEnabled,
  spineMaxFps,
  spineRenderScale,
} = storeToRefs(settingsStore)
const { sceneMutationLocked, scenePhase } = storeToRefs(modelStore)

const live2dSceneClassList = computed(() => normalizeClassList(props.live2dSceneClass))
const vrmSceneClassList = computed(() => normalizeClassList(props.vrmSceneClass))
const spineSceneClassList = computed(() => normalizeClassList(props.spineSceneClass))

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

  if (stageModelRenderer.value === 'spine')
    return captureCanvasFrame(spineSceneRef.value?.canvasElement())

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

  if (stageModelRenderer.value === 'spine') {
    const phase = resolveComponentStateToRuntimePhase(spineComponentState.value, { hasModel })

    return createEmptyModelSettingsRuntimeSnapshot({
      ownerInstanceId: vrmPreviewStageInstanceId,
      renderer: 'spine',
      phase,
      controlsLocked: hasModel ? phase !== 'mounted' : false,
      previewAvailable: hasModel,
      canCapturePreview: !!spineSceneRef.value?.canvasElement(),
      updatedAt: Date.now(),
    })
  }

  if (stageModelRenderer.value === 'godot') {
    return createEmptyModelSettingsRuntimeSnapshot({
      ownerInstanceId: vrmPreviewStageInstanceId,
      renderer: 'godot',
      phase: hasModel ? 'mounted' : 'no-model',
      controlsLocked: false,
      previewAvailable: false,
      canCapturePreview: false,
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
        :model-src="stageModelSelectedUrl"
        :model-id="stageModelSelected"
        :cursor-tracking="live2dCursorTracking"
        :theme-colors-hue="themeColorsHue"
        :theme-colors-hue-dynamic="themeColorsHueDynamic"
        :live2d-idle-animation-enabled="live2dIdleAnimationEnabled"
        :live2d-force-idle-eye-animation="live2dForceIdleEyeAnimation"
        :live2d-auto-blink-enabled="live2dAutoBlinkEnabled"
        :live2d-force-auto-blink-enabled="live2dForceAutoBlinkEnabled"
        :live2d-shadow-enabled="live2dShadowEnabled"
        :live2d-max-fps="live2dMaxFps"
        :live2d-render-scale="live2dRenderScale"
      />
    </div>
  </template>
  <template v-if="stageModelRenderer === 'vrm'">
    <div :class="vrmSceneClassList">
      <ThreeScene ref="vrmSceneRef" :model-src="stageModelSelectedUrl" />
    </div>
  </template>
  <template v-if="stageModelRenderer === 'spine'">
    <div :class="spineSceneClassList">
      <SpineScene
        ref="spineSceneRef"
        v-model:state="spineComponentState"
        :model-src="stageModelSelectedUrl"
        :model-id="stageModelSelected"
        :premultiplied-alpha="spinePremultipliedAlpha"
        :default-mix-duration="spineDefaultMixDuration"
        :idle-animation-enabled="spineIdleAnimationEnabled"
        :max-fps="spineMaxFps"
        :render-scale="spineRenderScale"
      />
    </div>
  </template>
</template>
