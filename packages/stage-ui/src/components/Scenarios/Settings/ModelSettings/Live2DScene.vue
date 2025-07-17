<script setup lang="ts">
import { useLive2d } from '@proj-airi/stage-ui/stores'
import { useElementBounding, useMouse } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'

import { Live2DCanvas, Live2DModel } from '../../../Scenes'

const live2dContainerRef = ref<HTMLDivElement>()
const live2dCanvasRef = ref<InstanceType<typeof Live2DCanvas>>()
const { width, height } = useElementBounding(live2dContainerRef)
const { positionInPercentageString, scale } = storeToRefs(useLive2d())

const positionCursor = useMouse()
</script>

<template>
  <div ref="live2dContainerRef" w="100%" h="100%">
    <Live2DCanvas
      v-slot="{ app }"
      ref="live2dCanvasRef"
      :width="width"
      :height="height"
      :resolution="2"
      max-h="100dvh"
    >
      <Live2DModel
        :app="app"
        :mouth-open-size="0"
        :width="width"
        :height="height"
        :paused="false"
        :focus-at="{
          x: positionCursor.x.value,
          y: positionCursor.y.value,
        }"
        :x-offset="positionInPercentageString.x"
        :y-offset="positionInPercentageString.y"
        :scale="scale"
      />
    </Live2DCanvas>
  </div>
</template>
