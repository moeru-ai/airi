<script setup lang="ts">
import type { Emotion } from '../../constants/emotions'

import { Screen } from '@proj-airi/ui'
import { ref, watch } from 'vue'

import SpineCanvas from './spine/Canvas.vue'
import SpineModel from './spine/Model.vue'

withDefaults(defineProps<{
  modelSrc?: string
  modelId?: string
  paused?: boolean
  premultipliedAlpha?: boolean
  defaultMixDuration?: number
  idleAnimationEnabled?: boolean
  maxFps?: number
  renderScale?: number
}>(), {
  paused: false,
  premultipliedAlpha: true,
  defaultMixDuration: 0.2,
  idleAnimationEnabled: true,
  maxFps: 0,
  renderScale: 1,
})

const componentState = defineModel<'pending' | 'loading' | 'mounted'>('state', { default: 'pending' })
const componentStateCanvas = defineModel<'pending' | 'loading' | 'mounted'>('canvasState', { default: 'pending' })
const componentStateModel = defineModel<'pending' | 'loading' | 'mounted'>('modelState', { default: 'pending' })

const canvasRef = ref<InstanceType<typeof SpineCanvas>>()
const modelRef = ref<InstanceType<typeof SpineModel>>()

watch([componentStateModel, componentStateCanvas], () => {
  componentState.value = (componentStateModel.value === 'mounted' && componentStateCanvas.value === 'mounted')
    ? 'mounted'
    : 'loading'
})

defineExpose({
  canvasElement: () => canvasRef.value?.canvasElement(),
  captureFrame: () => canvasRef.value?.captureFrame(),
  setEmotion: (emotion: Emotion, intensity?: number) => modelRef.value?.setEmotion(emotion, intensity),
  listAnimations: () => modelRef.value?.listAnimations() ?? [],
  listSkins: () => modelRef.value?.listSkins() ?? [],
})
</script>

<template>
  <Screen v-slot="{ width, height }" relative>
    <SpineCanvas
      ref="canvasRef"
      v-slot="{ canvas }"
      v-model:state="componentStateCanvas"
      :width="width"
      :height="height"
      :resolution="renderScale"
      max-h="100dvh"
    >
      <SpineModel
        ref="modelRef"
        v-model:state="componentStateModel"
        :model-src="modelSrc"
        :model-id="modelId"
        :canvas="canvas"
        :width="width"
        :height="height"
        :resolution="renderScale"
        :paused="paused"
        :premultiplied-alpha="premultipliedAlpha"
        :default-mix-duration="defaultMixDuration"
        :idle-animation-enabled="idleAnimationEnabled"
        :max-fps="maxFps"
      />
    </SpineCanvas>
  </Screen>
</template>
