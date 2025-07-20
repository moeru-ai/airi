<script setup lang="ts">
import { OrbitControls } from '@tresjs/cientos'
import { TresCanvas } from '@tresjs/core'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'

import { useVRM } from '../../stores'
import { Screen } from '../Misc'
import { VRMModel } from '../Scenes'

const props = withDefaults(defineProps<{
  paused?: boolean
  showAxes?: boolean
}>(), {
  paused: false,
  showAxes: false,
})

const emit = defineEmits<{
  (e: 'loadModelProgress', value: number): void
  (e: 'error', value: unknown): void
}>()
const { selectedModel, scale } = storeToRefs(useVRM())

const cameraPositionX = ref(0.17)
const cameraPositionY = ref(0.5)
const cameraPositionZ = ref(-1)

const modelRef = ref<{
  setExpression: (expression: string) => void
}>()

defineExpose({
  setExpression: (expression: string) => {
    modelRef.value?.setExpression(expression)
  },
})
</script>

<template>
  <Screen v-slot="{ width, height }" relative>
    <TresCanvas :alpha="true" :antialias="true" :width="width" :height="height">
      <OrbitControls :enable-zoom="false" />
      <TresAxesHelper v-if="props.showAxes" :size="1" />
      <TresPerspectiveCamera :position="[cameraPositionX, cameraPositionY, cameraPositionZ]" :zoom="scale" />
      <TresDirectionalLight :color="0xFFFFFF" :intensity="1.2" :position="[1, 1, 1]" />
      <TresAmbientLight :color="0xFFFFFF" :intensity="1.5" />
      <VRMModel
        ref="modelRef"
        :key="selectedModel"
        :model="selectedModel"
        idle-animation="/assets/vrm/animations/idle_loop.vrma"
        :paused="props.paused"
        @load-model-progress="(val) => emit('loadModelProgress', val)"
        @error="(val) => emit('error', val)"
      />
    </TresCanvas>
  </Screen>
</template>
