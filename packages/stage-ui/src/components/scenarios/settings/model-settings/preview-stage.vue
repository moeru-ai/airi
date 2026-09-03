<script setup lang="ts">
import type { Live2DContext } from '@proj-airi/stage-ui-live2d'

import type { ModelSettingsRuntimeSnapshot } from './runtime'

import { createLive2D, Live2DScene, useLive2dParams, useSettingsLive2d } from '@proj-airi/stage-ui-live2d'
import { MMDScene } from '@proj-airi/stage-ui-mmd'
import { SpineScene } from '@proj-airi/stage-ui-spine'
import { TachieScene } from '@proj-airi/stage-ui-tachie'
import { ThreeScene, useModelStore } from '@proj-airi/stage-ui-three'
import { useMouse } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onUnmounted, ref, watch } from 'vue'

import { useSharedLive2DExpressionPreview } from '../../../../stores/live2d'
import { useAiriCardStore } from '../../../../stores/modules/airi-card'
import { useSettings } from '../../../../stores/settings'
import {
  createEmptyModelSettingsRuntimeSnapshot,
  resolveComponentStateToRuntimePhase,
} from './runtime'

const props = defineProps<{
  live2dSceneClass?: string | string[]
  live2dContext?: Live2DContext
  vrmSceneClass?: string | string[]
  spineSceneClass?: string | string[]
  tachieSceneClass?: string | string[]
  mmdSceneClass?: string | string[]
}>()

const emit = defineEmits<{
  (e: 'runtimeSnapshotChanged', value: ModelSettingsRuntimeSnapshot): void
}>()

const ownsLive2D = !props.live2dContext
const live2d = props.live2dContext ?? createLive2D()

onUnmounted(() => {
  if (ownsLive2D)
    live2d.dispose()
})

const settingsStore = useSettings()
const modelStore = useModelStore()
const live2dSettingsStore = useSettingsLive2d()
const live2dParametersStore = useLive2dParams()
const { selectedAvatarModelId } = storeToRefs(useAiriCardStore())
useSharedLive2DExpressionPreview(live2d, selectedAvatarModelId)
const live2dSceneRef = ref<{ canvasElement: () => HTMLCanvasElement | undefined }>()
const vrmSceneRef = ref<{ canvasElement: () => HTMLCanvasElement | undefined }>()
const spineSceneRef = ref<{ canvasElement: () => HTMLCanvasElement | undefined }>()
const tachieSceneRef = ref<{ canvasElement: () => HTMLCanvasElement | undefined }>()
const mmdSceneRef = ref<{ canvasElement: () => HTMLCanvasElement | undefined }>()
const live2dComponentState = ref<'pending' | 'loading' | 'mounted'>('pending')
const spineComponentState = ref<'pending' | 'loading' | 'mounted'>('pending')
const tachieComponentState = ref<'pending' | 'loading' | 'mounted'>('pending')
const mmdComponentState = ref<'pending' | 'loading' | 'mounted'>('pending')
const vrmPreviewStageInstanceId = `model-settings-preview-stage:${Math.random().toString(36).slice(2, 10)}`

const {
  stageModelSelected,
  stageModelSelectedUrl,
  stageModelRenderer,
  themeColorsHue,
  themeColorsHueDynamic,

} = storeToRefs(settingsStore)
const {
  live2dMotionDriver,
  live2dEyeTracking,
  live2dModelEyeOffset,
  live2dIdleAnimationEnabled,
  live2dForceIdleEyeAnimation,
  live2dAutoBlinkEnabled,
  live2dForceAutoBlinkEnabled,
  live2dExpressionEnabled,
  live2dShadowEnabled,
  live2dMaxFps,
  live2dRenderScale,
} = storeToRefs(live2dSettingsStore)
const { scale: live2dModelScale } = storeToRefs(live2dParametersStore)
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
const tachieSceneClassList = computed(() => normalizeClassList(props.tachieSceneClass))
const mmdSceneClassList = computed(() => normalizeClassList(props.mmdSceneClass))

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

  if (stageModelRenderer.value === 'tachie')
    return captureCanvasFrame(tachieSceneRef.value?.canvasElement())

  if (stageModelRenderer.value === 'mmd')
    return captureCanvasFrame(mmdSceneRef.value?.canvasElement())

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

  if (stageModelRenderer.value === 'tachie') {
    const phase = resolveComponentStateToRuntimePhase(tachieComponentState.value, { hasModel })

    return createEmptyModelSettingsRuntimeSnapshot({
      ownerInstanceId: vrmPreviewStageInstanceId,
      renderer: 'tachie',
      phase,
      controlsLocked: hasModel ? phase !== 'mounted' : false,
      previewAvailable: hasModel,
      canCapturePreview: !!tachieSceneRef.value?.canvasElement(),
      updatedAt: Date.now(),
    })
  }

  if (stageModelRenderer.value === 'mmd') {
    const phase = resolveComponentStateToRuntimePhase(mmdComponentState.value, { hasModel })

    return createEmptyModelSettingsRuntimeSnapshot({
      ownerInstanceId: vrmPreviewStageInstanceId,
      renderer: 'mmd',
      phase,
      controlsLocked: hasModel ? phase !== 'mounted' : false,
      previewAvailable: hasModel,
      canCapturePreview: !!mmdSceneRef.value?.canvasElement(),
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

const { x: mouseX, y: mouseY } = useMouse()
const cursorPosition = computed(() => ({
  x: mouseX.value,
  y: mouseY.value,
}))
</script>

<template>
  <template v-if="stageModelRenderer === 'live2d'">
    <div :class="live2dSceneClassList">
      <Live2DScene
        ref="live2dSceneRef"
        v-model:state="live2dComponentState"
        :context="live2d"
        :model-src="stageModelSelectedUrl"
        :model-id="stageModelSelected"
        :cursor-position="cursorPosition"
        :theme-colors-hue="themeColorsHue"
        :theme-colors-hue-dynamic="themeColorsHueDynamic"
        :motion-driver="live2dMotionDriver"
        :eye-tracking="live2dEyeTracking"
        :model-eye-offset="live2dModelEyeOffset"
        :model-scale="live2dModelScale"
        :idle-animation-enabled="live2dIdleAnimationEnabled"
        :force-idle-eye-animation="live2dForceIdleEyeAnimation"
        :auto-blink-enabled="live2dAutoBlinkEnabled"
        :force-auto-blink-enabled="live2dForceAutoBlinkEnabled"
        :expression-enabled="live2dExpressionEnabled"
        :shadow-enabled="live2dShadowEnabled"
        :max-fps="live2dMaxFps"
        :render-scale="live2dRenderScale"
      />
    </div>
  </template>
  <template v-if="stageModelRenderer === 'vrm'">
    <div :class="vrmSceneClassList">
      <ThreeScene ref="vrmSceneRef" :cursor-position="cursorPosition" :model-id="stageModelSelected" :model-src="stageModelSelectedUrl" />
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
  <template v-if="stageModelRenderer === 'mmd'">
    <div :class="mmdSceneClassList">
      <MMDScene
        ref="mmdSceneRef"
        v-model:state="mmdComponentState"
        :model-src="stageModelSelectedUrl"
        :model-id="stageModelSelected"
        :cursor-position="cursorPosition"
        :enable-orbit-controls="true"
      />
    </div>
  </template>
  <template v-if="stageModelRenderer === 'tachie'">
    <div :class="tachieSceneClassList">
      <TachieScene
        ref="tachieSceneRef"
        v-model:state="tachieComponentState"
        :model-src="stageModelSelectedUrl"
        :model-id="stageModelSelected"
        :theme-colors-hue="themeColorsHue"
        :theme-colors-hue-dynamic="themeColorsHueDynamic"
      />
    </div>
  </template>
</template>
