<script setup lang="ts">
import type { RendererBus, Unsub } from '../bus'

import { extend, useTresContext } from '@tresjs/core'
import { until } from '@vueuse/core'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { onMounted, onUnmounted, shallowRef } from 'vue'

import * as THREE from 'three'

const props = defineProps<{
  bus: RendererBus
}>()

const emit = defineEmits<{
  (e: 'ready'): void
}>()

extend({ OrbitControls })

const { camera: cameraTres, renderer } = useTresContext()
const controls = shallowRef<OrbitControls>()
const camera = shallowRef<THREE.PerspectiveCamera | null>(null)

let disposeChangeEvent: (() => void) | null = null
let unSubList: Array<Unsub> = []

// Initialisation on onMounted
function registerBus() {
  // === Command: stage-ui => renderer-three ===
  // Get mode size => update min/max camera distance
  unSubList.push(props.bus.commandsBus.on(
    'orbit-controls/model-size',
    (newSize) => {
      if (!controls.value)
        return
      controls.value.minDistance = newSize.z
      controls.value.maxDistance = newSize.z * 20
      controls.value.update()
    },
    { immediate: true },
  ))
  // Get camera position => update position
  unSubList.push(props.bus.commandsBus.on(
    'orbit-controls/position',
    (newPosition) => {
      if (!camera.value || !controls.value)
        return
      camera.value.position.set(
        newPosition.x,
        newPosition.y,
        newPosition.z,
      )
      camera.value.updateProjectionMatrix()
      controls.value.update()
    },
    { immediate: true },
  ))
  // Get camera target => update target (actually the model center)
  unSubList.push(props.bus.commandsBus.on(
    'orbit-controls/target',
    (newTarget) => {
      if (!controls.value)
        return
      controls.value!.target.set(newTarget.x, newTarget.y, newTarget.z)
      controls.value!.update()
    },
    { immediate: true },
  ))
  // Get fov => update camera fov
  unSubList.push(props.bus.commandsBus.on(
    'orbit-controls/fov',
    (newFOV) => {
      if (!camera.value || !controls.value)
        return
      camera!.value!.fov = newFOV
      camera!.value!.updateProjectionMatrix()
      controls.value!.update()
    },
    { immediate: true },
  ))
  // Get camera distance => update camera distance
  unSubList.push(props.bus.commandsBus.on(
    'orbit-controls/distance',
    (newDistance) => {
      if (!camera.value || !controls.value)
        return
      const newPosition = new THREE.Vector3()
      const target = controls.value!.target
      const direction = new THREE.Vector3().subVectors(camera.value.position, target).normalize()
      newPosition.copy(target).addScaledVector(direction, newDistance)
      camera.value.position.set(
        newPosition.x,
        newPosition.y,
        newPosition.z,
      )
      camera.value.updateProjectionMatrix()
      controls.value.update()
    },
    { immediate: true },
  ))

  // === Event: renderer-three => stage-ui ===
  // send camera update info
  const onChange = () => {
    props.bus.eventsBus.emit(
      'orbit-controls/camera-changed',
      {
        cameraPosition: {
          x: camera!.value!.position.x,
          y: camera!.value!.position.y,
          z: camera!.value!.position.z,
        },
        cameraDistance: controls.value!.getDistance(),
      },
    )
  }
  controls.value?.addEventListener('change', onChange)
  disposeChangeEvent = () => controls.value?.removeEventListener('change', onChange)
}

onMounted(async () => {
  await until(() => cameraTres.value && renderer.value?.domElement).toBeTruthy()
  if (!cameraTres.value || !renderer.value?.domElement) {
    console.warn('Camera or Renderer initialisation failure!')
    return
  }
  // Narrow down the camera's type
  if (!(cameraTres.value instanceof THREE.PerspectiveCamera)) {
    console.warn('Camera is not perspective camera, type error!')
    return
  }
  camera.value = cameraTres.value as THREE.PerspectiveCamera
  // Obtain orbitControl instance
  controls.value = new OrbitControls(camera.value, renderer.value.domElement)
  // Align to tresjs conventions
  controls.value.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN,
  }
  controls.value.touches = {
    ONE: THREE.TOUCH.ROTATE,
    TWO: THREE.TOUCH.DOLLY_PAN,
  }
  controls.value.enablePan = false
  // register handler and event to bus
  registerBus()
  controls.value.update()

  emit('ready')
})

onUnmounted(() => {
  disposeChangeEvent?.()
  unSubList.forEach(unSub => unSub())
  unSubList = []
})

defineExpose({
  controls,
  getDistance: () => controls.value?.getDistance(),
  update: () => controls.value?.update(),
  setTarget: (target: { x: number, y: number, z: number }) => {
    if (controls.value) {
      controls.value.target.set(target.x, target.y, target.z)
      controls.value.update()
    }
  },
})
</script>

<template>
  <slot />
</template>
