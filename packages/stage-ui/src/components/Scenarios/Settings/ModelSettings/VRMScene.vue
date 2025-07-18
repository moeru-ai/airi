<script setup lang="ts">
import { OrbitControls } from '@tresjs/cientos'
import { TresCanvas } from '@tresjs/core'
import { useElementBounding } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'

import { useVRM } from '../../../../stores'
import { VRMModel } from '../../../Scenes'

const emit = defineEmits<{
  (e: 'loadModelProgress', value: number): void
  (e: 'error', value: unknown): void
}>()
const VRMContainerRef = ref<HTMLDivElement>()
const { width, height } = useElementBounding(VRMContainerRef)
<<<<<<< HEAD
const { selectedModel } = storeToRefs(useVRM())
=======
const { modelFile, modelUrl, loadSource, selectedModel } = storeToRefs(useVRM())
>>>>>>> c98a2f83 (Update packages/stage-ui/src/components/Scenarios/Settings/ModelSettings/VRMScene.vue)

const cameraPositionX = ref(-0.17)
const cameraPositionY = ref(0)
const cameraPositionZ = ref(-1)
const vrmModelPositionX = ref(-0.18)
const vrmModelPositionY = ref(-1.32)
const vrmModelPositionZ = ref(-0.24)

const modelRef = ref<{
  setExpression: (expression: string) => void
}>()

defineExpose({
  setExpression: (expression: string) => {
    modelRef.value?.setExpression(expression)
  },
})
<<<<<<< HEAD
=======

>>>>>>> aa2b05ce (Update packages/stage-ui/src/components/Scenarios/Settings/ModelSettings/VRMScene.vue)
</script>

<template>
  <div ref="VRMContainerRef" w="100%" h="100%">
    <TresCanvas :alpha="true" :antialias="true" :width="width" :height="height">
      <OrbitControls />
      <TresPerspectiveCamera :position="[cameraPositionX, cameraPositionY, cameraPositionZ]" />
      <TresDirectionalLight :color="0xFFFFFF" :intensity="1.2" :position="[1, 1, 1]" />
      <TresAmbientLight :color="0xFFFFFF" :intensity="1.5" />
      <VRMModel
        ref="modelRef"
        :key="selectedModel"
        :model="selectedModel"
        idle-animation="/assets/vrm/animations/idle_loop.vrma"
        :position="[vrmModelPositionX, vrmModelPositionY, vrmModelPositionZ]"
        :paused="false"
        @load-model-progress="(val) => emit('loadModelProgress', val)"
        @error="(val) => emit('error', val)"
      />
    </TresCanvas>
  </div>
</template>
