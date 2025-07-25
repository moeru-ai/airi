<script setup lang="ts">
import { TresCanvas } from '@tresjs/core'
import { useElementBounding } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { onUnmounted, ref, shallowRef, watch } from 'vue'

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
const sceneReady = ref(false)

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
  if (ctrl && camera.value) {
    controlsReady.value = true

    const updateCameraFromControls = () => {
      if (isUpdatingCamera)
        return
      isUpdatingCamera = true

      const newPos = camera.value!.position
      const newDist = controlsRef.value!.controls!.getDistance()

      const posChanged
        = Math.abs(cameraPosition.value.x - newPos.x) > 1e-6
          || Math.abs(cameraPosition.value.y - newPos.y) > 1e-6
          || Math.abs(cameraPosition.value.z - newPos.z) > 1e-6

      const distChanged = Math.abs(cameraDistance.value - newDist) > 1e-6

      if (posChanged || distChanged) {
        cameraPosition.value = { x: newPos.x, y: newPos.y, z: newPos.z }
        cameraDistance.value = newDist
      }

      isUpdatingCamera = false
    }

    ctrl.addEventListener('change', updateCameraFromControls)

    onUnmounted(() => {
      ctrl.removeEventListener('change', updateCameraFromControls)
    })
  }
})
// If model is ready
function handleLoadModelProgress() {
  modelReady.value = true
}
// Then start to set the camera postion and target
watch(
  [controlsReady, modelReady],
  ([ctrlOk, modelOk]) => {
    if (ctrlOk && modelOk && camera.value && controlsRef.value && controlsRef.value.controls) {
      isUpdatingCamera = true
      try {
        camera.value.aspect = width.value / height.value
        camera.value.fov = cameraFOV.value
        // Set camera target
        controlsRef.value.setTarget(modelOrigin.value)
        // Set camera position
        camera.value.position.set(
          cameraPosition.value.x,
          cameraPosition.value.y,
          cameraPosition.value.z,
        )
        camera.value.updateProjectionMatrix()
        controlsRef.value.controls.update()
        cameraDistance.value = controlsRef.value!.controls!.getDistance()
      }
      finally {
        isUpdatingCamera = false
        sceneReady.value = true
      }
    }
  },
)
// Bidirectional watch between slider and OrbitControls
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
watch(cameraPosition, (newPosition) => {
  if (modelRef.value) {
    modelRef.value.lookAtUpdate(newPosition)
  }
}, { deep: true })

defineExpose({
  setExpression: (expression: string) => {
    modelRef.value?.setExpression(expression)
  },
})
</script>

<template>
  <div ref="vrmContainerRef" w="100%" h="100%">
    <TresCanvas v-if="camera" v-show="sceneReady" :camera="camera" :alpha="true" :antialias="true" :width="width" :height="height">
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
      <TresAxesHelper :size="1" />
    </TresCanvas>
  </div>
</template>
