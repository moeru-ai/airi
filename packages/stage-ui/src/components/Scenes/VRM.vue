<script setup lang="ts">
import { TresCanvas } from '@tresjs/core'
import { useElementBounding } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { onMounted, ref, shallowRef, watch } from 'vue'

import * as THREE from 'three'

import { useVRM } from '../../stores'
import { OrbitControls, VRMModel } from '../Scenes'

const emit = defineEmits<{
  (e: 'loadModelProgress', value: number): void
  (e: 'error', value: unknown): void
}>()
const vrmContainerRef = ref<HTMLDivElement>()
const { width, height } = useElementBounding(VRMContainerRef)
const {
  selectedModel,
  cameraFOV,
  initialCameraPosition,
} = storeToRefs(useVRM())

const modelRef = ref<InstanceType<typeof VRMModel>>()

const camera = shallowRef(new THREE.PerspectiveCamera())

onMounted(() => {
  if (VRMContainerRef.value) {
    camera.value.aspect = width.value / height.value
    camera.value.fov = cameraFOV.value
    camera.value.position.set(
      initialCameraPosition.value.x,
      initialCameraPosition.value.y,
      initialCameraPosition.value.z,
    )
    camera.value.updateProjectionMatrix()
  }
})

watch(cameraFOV, (newFov) => {
  if (camera.value) {
    camera.value.fov = newFov
    camera.value.updateProjectionMatrix()
  }
})

// not sure if we need this
// watch([width, height], () => {
//   if (camera.value) {
//     camera.value.aspect = width.value / height.value
//     camera.value.updateProjectionMatrix()
//   }
// })

watch(selectedModel, () => {
  if (camera.value) {
    camera.value.position.set(
      initialCameraPosition.value.x,
      initialCameraPosition.value.y,
      initialCameraPosition.value.z,
    )
    camera.value.updateProjectionMatrix()
  }
})

defineExpose({
  setExpression: (expression: string) => {
    modelRef.value?.setExpression(expression)
  },
})
</script>

<template>
  <div ref="VRMContainerRef" w="100%" h="100%">
    <TresCanvas v-if="camera" :camera="camera" :alpha="true" :antialias="true" :width="width" :height="height">
      <TresAxesHelper :size="1" />
      <TresDirectionalLight :color="0xFFFFFF" :intensity="1.2" :position="[1, 1, 1]" />
      <TresAmbientLight :color="0xFFFFFF" :intensity="1.5" />
      <VRMModel
        ref="modelRef"
        :key="selectedModel"
        :model="selectedModel"
        idle-animation="/assets/vrm/animations/idle_loop.vrma"
        :paused="false"
        @load-model-progress="(val) => emit('loadModelProgress', val)"
        @error="(val) => emit('error', val)"
      />
      <!-- <TresPerspectiveCamera :position="[initialCameraPosition.x, initialCameraPosition.y, initialCameraPosition.z]" :fov="cameraFOV"/> -->
      <OrbitControls />
    </TresCanvas>
  </div>
</template>
