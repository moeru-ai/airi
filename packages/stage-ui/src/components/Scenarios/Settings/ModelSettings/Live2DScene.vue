<script setup lang="ts">
import { Screen } from '@proj-airi/stage-ui/components'
import { useLive2d } from '@proj-airi/stage-ui/stores'
import { useMouse } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'

import { Live2DCanvas, Live2DModel } from '../../../Scenes'

const live2dCanvasRef = ref<InstanceType<typeof Live2DCanvas>>()
const { positionInPercentageString, scale } = storeToRefs(useLive2d())

const positionCursor = useMouse()
</script>

<template>
  <Screen v-slot="{ width, height }" relative min-h-70dvh>
    <Live2DCanvas
      ref="live2dCanvasRef"
      v-slot="{ app }"
      :width="width"
      :height="height"
      :resolution="3"
      rounded-full
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
  </Screen>
</template>
