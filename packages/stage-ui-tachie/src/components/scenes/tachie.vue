<script setup lang="ts">
import type { TachieEmotion } from '../../constants/emotions'

import { Screen } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, useTemplateRef, watch } from 'vue'

import TachieCanvas from './tachie/canvas.vue'
import TachieModel from './tachie/model.vue'

import { useTachie } from '../../stores/tachie'

const props = defineProps<{
  modelSrc?: string
  modelId?: string
  paused?: boolean
  renderScale?: number
  shadowEnabled?: boolean
  themeColorsHue?: number
  themeColorsHueDynamic?: boolean
}>()

const emit = defineEmits<{
  error: [value: unknown]
}>()

const componentState = defineModel<'pending' | 'loading' | 'mounted'>('state', { default: 'pending' })
const componentStateCanvas = defineModel<'pending' | 'loading' | 'mounted'>('canvasState', { default: 'pending' })
const componentStateModel = defineModel<'pending' | 'loading' | 'mounted'>('modelState', { default: 'pending' })
const canvasRef = useTemplateRef<InstanceType<typeof TachieCanvas>>('canvas')
const modelRef = useTemplateRef<InstanceType<typeof TachieModel>>('model')
const tachieStore = useTachie()
const { renderScale: storedRenderScale, shadowEnabled: storedShadowEnabled } = storeToRefs(tachieStore)

const effectiveRenderScale = computed(() => props.renderScale ?? storedRenderScale.value)
const effectiveShadowEnabled = computed(() => props.shadowEnabled ?? storedShadowEnabled.value)

watch([componentStateModel, componentStateCanvas], () => {
  componentState.value = componentStateModel.value === 'mounted' && componentStateCanvas.value === 'mounted'
    ? 'mounted'
    : 'loading'
})

defineExpose({
  canvasElement: () => canvasRef.value?.canvasElement(),
  captureFrame: () => canvasRef.value?.captureFrame(),
  setEmotion: (emotion: TachieEmotion, intensity?: number) => modelRef.value?.setEmotion(emotion, intensity),
})
</script>

<template>
  <Screen v-slot="{ width, height }" relative>
    <TachieCanvas
      ref="canvas"
      v-slot="{ app }"
      v-model:state="componentStateCanvas"
      :width="width"
      :height="height"
      :resolution="effectiveRenderScale"
      max-h="100dvh"
    >
      <TachieModel
        ref="model"
        v-model:state="componentStateModel"
        :app="app"
        :model-src="modelSrc"
        :model-id="modelId"
        :width="width"
        :height="height"
        :paused="paused"
        :shadow-enabled="effectiveShadowEnabled"
        :theme-colors-hue="themeColorsHue"
        :theme-colors-hue-dynamic="themeColorsHueDynamic"
        @error="emit('error', $event)"
      />
    </TachieCanvas>
  </Screen>
</template>
