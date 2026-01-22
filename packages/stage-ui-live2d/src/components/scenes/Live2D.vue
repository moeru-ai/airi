<script setup lang="ts">
import { Screen } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'

import Live2DCanvas from './live2d/Canvas.vue'
import Live2DModel from './live2d/Model.vue'

import { useLive2d } from '../../stores/live2d'

import '../../utils/live2d-zip-loader'
import '../../utils/live2d-opfs-registration'

const props = withDefaults(defineProps<{
  modelSrc?: string
  modelId?: string

  paused?: boolean
  mouthOpenSize?: number
  focusAt?: { x: number, y: number }
  disableFocusAt?: boolean
  scale?: number
  themeColorsHue?: number
  themeColorsHueDynamic?: boolean
  live2dIdleAnimationEnabled?: boolean
  live2dAutoBlinkEnabled?: boolean
  live2dForceAutoBlinkEnabled?: boolean
  live2dShadowEnabled?: boolean
}>(), {
  paused: false,
  focusAt: () => ({ x: 0, y: 0 }),
  mouthOpenSize: 0,
  scale: 1,
  themeColorsHue: 220.44,
  themeColorsHueDynamic: false,
  live2dIdleAnimationEnabled: true,
  live2dAutoBlinkEnabled: true,
  live2dForceAutoBlinkEnabled: false,
  live2dShadowEnabled: true,
})

const componentState = defineModel<'pending' | 'loading' | 'mounted'>('state', { default: 'pending' })
const componentStateCanvas = defineModel<'pending' | 'loading' | 'mounted'>('canvasState', { default: 'pending' })
const componentStateModel = defineModel<'pending' | 'loading' | 'mounted'>('modelState', { default: 'pending' })

const live2dCanvasRef = ref<InstanceType<typeof Live2DCanvas>>()

const live2d = useLive2d()
const { position, scale: storeScale } = storeToRefs(live2d)

// Use store's scale reactively by default, but allow prop to override
// The prop scale acts as a multiplier in Model.vue, so we use store scale as the base reactive value
// If a prop is explicitly provided (different from default 1), it will override
const scale = computed(() => {
  // Prefer store scale for reactivity, but if prop is explicitly set to a non-default value, use it
  // Since we can't detect if prop was provided vs default, we check if it differs from store
  // If prop equals store value, use store (reactive); if different, prop takes precedence
  return props.scale !== storeScale.value ? props.scale : storeScale.value
})

watch([componentStateModel, componentStateCanvas], () => {
  componentState.value = (componentStateModel.value === 'mounted' && componentStateCanvas.value === 'mounted')
    ? 'mounted'
    : 'loading'
})

defineExpose({
  canvasElement: () => {
    return live2dCanvasRef.value?.canvasElement()
  },
})
</script>

<template>
  <Screen v-slot="{ width, height }" relative>
    <Live2DCanvas
      ref="live2dCanvasRef"
      v-slot="{ app }"
      v-model:state="componentStateCanvas"
      :width="width"
      :height="height"
      :resolution="2"
      max-h="100dvh"
    >
      <Live2DModel
        v-model:state="componentStateModel"
        :model-src="modelSrc"
        :model-id="modelId"
        :app="app"
        :mouth-open-size="mouthOpenSize"
        :width="width"
        :height="height"
        :paused="paused"
        :focus-at="focusAt"
        :x-offset="position.x"
        :y-offset="position.y"
        :scale="scale"
        :disable-focus-at="disableFocusAt"
        :theme-colors-hue="themeColorsHue"
        :theme-colors-hue-dynamic="themeColorsHueDynamic"
        :live2d-idle-animation-enabled="live2dIdleAnimationEnabled"
        :live2d-auto-blink-enabled="live2dAutoBlinkEnabled"
        :live2d-force-auto-blink-enabled="live2dForceAutoBlinkEnabled"
        :live2d-shadow-enabled="live2dShadowEnabled"
      />
    </Live2DCanvas>
  </Screen>
</template>
