<script setup lang="ts">
import { TresCanvas } from '@tresjs/core'
import { useElementBounding } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { ref, shallowRef, watch } from 'vue'

import * as THREE from 'three'

import { useVRM } from '../../stores'
import { OrbitControls, VRMModel } from '../Scenes'

const emit = defineEmits<{
  (e: 'loadModelProgress', value: number): void
  (e: 'error', value: unknown): void
}>()
const vrmContainerRef = ref<HTMLDivElement>()
const { width, height } = useElementBounding(vrmContainerRef)
const {
  selectedModel,
  cameraFOV,
  cameraPosition,
  cameraDistance,
  modelOrigin,
} = storeToRefs(useVRM())

const modelRef = ref<InstanceType<typeof VRMModel>>()

const camera = shallowRef(new THREE.PerspectiveCamera())
const controlsRef = ref<InstanceType<typeof OrbitControls>>()
let isUpdatingCamera = true
// manage the sequence of the camera and controls initialization
const controlsReady = ref(false)
const modelReady = ref(false)

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
// If controls are ready
watch(() => controlsRef.value?.controls, (ctrl) => {
  if (ctrl)
    controlsReady.value = true
})
// If model is ready
function handleLoadModelProgress() {
  modelReady.value = true
}
// Then start to set the camera postion and target
watch(
  [controlsReady, modelReady],
  ([ctrlOk, modelOk]) => {
    console.warn('start camera setting')
    console.warn('ctr OK?', ctrlOk)
    console.warn('model OK? ', modelOk)
    console.warn('controlsRef is defined? ', controlsRef.value)
    console.warn('controlsRef.value.controls is defined?', controlsRef)
    if (ctrlOk && modelOk && camera.value && controlsRef.value && controlsRef.value.controls) {
      isUpdatingCamera = true
      try {
        camera.value.aspect = width.value / height.value
        camera.value.fov = cameraFOV.value
        // Set camera position
        camera.value.position.set(
          cameraPosition.value.x,
          cameraPosition.value.y,
          cameraPosition.value.z,
        )
        camera.value.updateProjectionMatrix()
        // Set camera target
        controlsRef.value.setTarget(modelOrigin.value)
        // controlsRef.value.controls.update()
        console.warn('camera setting complete: ', camera.value.position)
      }
      finally {
        isUpdatingCamera = false
      }
    }
  },
)

// Bidirectional watch between slider and OrbitControls
watch(() => controlsRef.value?.getDistance(), (newDistance) => {
  if (!isUpdatingCamera && newDistance !== undefined && camera.value) {
    // To avoid floating point inaccuracies causing a feedback loop with the other watcher,
    // we can check if the distance has changed significantly.
    isUpdatingCamera = true
    if (Math.abs(cameraDistance.value - newDistance) > 1e-6) {
      cameraDistance.value = newDistance
      cameraPosition.value = {
        x: camera.value.position.x,
        y: camera.value.position.y,
        z: camera.value.position.z,
      }
    }
    isUpdatingCamera = false
  }
})
watch(cameraDistance, (newDistance) => {
  if (!isUpdatingCamera && camera.value && controlsRef.value && controlsRef.value.controls) {
    isUpdatingCamera = true
    const newPosition = new THREE.Vector3()
    const target = controlsRef.value.controls.target
    const direction = new THREE.Vector3().subVectors(camera.value.position, target).normalize()
    newPosition.copy(target).addScaledVector(direction, newDistance)
    camera.value.position.set(
      newPosition.x,
      newPosition.y,
      newPosition.z,
    )
    controlsRef.value.update()
    cameraPosition.value = {
      x: newPosition.x,
      y: newPosition.y,
      z: newPosition.z,
    }
  }

  isUpdatingCamera = false
})

defineExpose({
  setExpression: (expression: string) => {
    modelRef.value?.setExpression(expression)
  },
})
</script>

<template>
  <div ref="vrmContainerRef" w="100%" h="100%">
    <TresCanvas v-if="camera" :camera="camera" :alpha="true" :antialias="true" :width="width" :height="height">
      <TresAxesHelper :size="1" />
      <OrbitControls ref="controlsRef" />
      <TresDirectionalLight :color="0xFFFFFF" :intensity="1.8" :position="[1, 1, -10]" />
      <TresAmbientLight :color="0xFFFFFF" :intensity="1.2" />
      <VRMModel
        ref="modelRef"
        :key="selectedModel"
        :model="selectedModel"
        idle-animation="/assets/vrm/animations/idle_loop.vrma"
        :paused="false"
        @load-model-progress="(val) => emit('loadModelProgress', val)"
        @model-ready="handleLoadModelProgress"
        @error="(val) => emit('error', val)"
      />
    </TresCanvas>
  </div>
</template>
