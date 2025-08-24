<script setup lang="ts">
import Screen from '../Misc/Screen.vue'
import Live2DCanvas from './Live2D/Canvas.vue'
import Live2DModel from './Live2D/Model.vue'

import '../../utils/live2d-zip-loader'

withDefaults(defineProps<{
  modelSrc?: string

  paused?: boolean
  mouthOpenSize?: number
  focusAt?: { x: number, y: number }
  disableFocusAt?: boolean
  xOffset?: number | string
  yOffset?: number | string
  scale?: number
}>(), {
  paused: false,
  focusAt: () => ({ x: 0, y: 0 }),
  mouthOpenSize: 0,
  scale: 1,
})
</script>

<template>
  <Screen v-slot="{ width, height }" relative>
    <Live2DCanvas
      v-slot="{ app }"
      :width="width"
      :height="height"
      :resolution="2"
      max-h="100dvh"
    >
      <Live2DModel
        :model-src="modelSrc"
        :app="app"
        :mouth-open-size="mouthOpenSize"
        :width="width"
        :height="height"
        :paused="paused"
        :focus-at="focusAt"
        :x-offset="xOffset"
        :y-offset="yOffset"
        :scale="scale"
        :disable-focus-at="disableFocusAt"
      />
    </Live2DCanvas>
  </Screen>
</template>
