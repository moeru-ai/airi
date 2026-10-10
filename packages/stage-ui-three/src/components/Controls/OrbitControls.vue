<script setup lang="ts">
/*
  * - Extend OrbitControls from three
  * - Define camera behavior
*/

import type { Vec3 } from '../../stores/model-store'

import { extend, useTres } from '@tresjs/core'
import { until } from '@vueuse/core'
import {
  MOUSE,
  PerspectiveCamera,
  TOUCH,
  Vector3,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
// From stage-ui-three package
import { onMounted, onUnmounted, shallowRef, toRefs, watch } from 'vue'

import { OrbitPivotTransition } from '../../composables/orbit-pivot'
import { useThreeCamera } from '../../stores/camera'

/*
  * Props:
  * - model size
  * - camera target: camera looking at target
*/
const props = defineProps<{
  controlEnable: boolean
  modelSize: Vec3
  cameraTarget: Vec3
}>()
/*
  * Emits:
  * - camera changed: orbit controls can receive user input and change camera's position
  * - ready
*/
const emit = defineEmits<{
  (e: 'orbitControlsCameraChanged', value: {
    newCameraPosition: Vec3
    newCameraDistance: number
  }): void
  (e: 'orbitControlsReady'): void
  (e: 'orbitControlsPivotChanged', active: boolean): void
  (e: 'orbitControlsInteractionChanged', active: boolean): void
  (e: 'orbitControlsTransitionChanged', active: boolean): void
}>()

const {
  controlEnable,
  modelSize,
  cameraTarget,
} = toRefs(props)

extend({ OrbitControls })

const { camera: cameraTres, renderer } = useTres()
const controls = shallowRef<OrbitControls>()
const camera = shallowRef<PerspectiveCamera | null>(null)
let disposeControlsChange: (() => void) | undefined
const pivotTransition = new OrbitPivotTransition()
let pivotFrame = 0
let pivotFrameAt = 0

function cancelPivotTransition() {
  cancelAnimationFrame(pivotFrame)
  pivotFrame = 0
  pivotTransition.cancel()
  emit('orbitControlsTransitionChanged', false)
}

function shiftTarget(target: Vec3, restoreShared = false) {
  if (!camera.value || !controls.value || !controlEnable.value)
    return
  cancelPivotTransition()
  pivotTransition.startAt(camera.value, controls.value.target, new Vector3(target.x, target.y, target.z), matchMedia('(prefers-reduced-motion: reduce)').matches, restoreShared)
  emit('orbitControlsPivotChanged', true)
  emit('orbitControlsTransitionChanged', true)
  pivotFrameAt = performance.now()
  const frame = (now: number) => {
    if (!camera.value || !controls.value)
      return
    const active = pivotTransition.update(camera.value, controls.value.target, (now - pivotFrameAt) / 1000)
    pivotFrameAt = now
    controls.value.update()
    if (!active && !pivotTransition.isInspectionActive) {
      emit('orbitControlsPivotChanged', false)
      controls.value.dispatchEvent({ type: 'change' })
    }
    if (!active)
      emit('orbitControlsTransitionChanged', false)
    pivotFrame = active ? requestAnimationFrame(frame) : 0
  }
  pivotFrame = requestAnimationFrame(frame)
}

const { cameraPosition, cameraFOV, cameraDistance } = useThreeCamera()

interface OrbitDistanceBounds {
  maxDistance: number
  minDistance: number
}

const MIN_MODEL_DEPTH_FOR_DISTANCE_BOUNDS = 1e-6

function resolveModelDistanceBounds(modelSize: Vec3): OrbitDistanceBounds | undefined {
  const modelDepth = modelSize.z

  if (!Number.isFinite(modelDepth) || modelDepth <= MIN_MODEL_DEPTH_FOR_DISTANCE_BOUNDS)
    return undefined

  return {
    maxDistance: modelDepth * 20,
    minDistance: modelDepth,
  }
}

// Initialisation on onMounted
function registerInfoFlow() {
  /*
    * Downward info flow
    * - Pinia store value updated => command take effect
  */
  // Get mode size => update min/max camera distance
  watch(modelSize, (newSize) => {
    if (!controls.value)
      return
    const distanceBounds = resolveModelDistanceBounds(newSize)
    if (!distanceBounds)
      return

    controls.value.minDistance = distanceBounds.minDistance
    controls.value.maxDistance = distanceBounds.maxDistance
    controls.value.update()
  }, { immediate: true, deep: true })
  // Get camera position => update position
  watch(cameraPosition, (newPosition) => {
    if (pivotTransition.isInspectionActive || !camera.value || !controls.value)
      return
    camera.value.position.set(
      newPosition.x,
      newPosition.y,
      newPosition.z,
    )
    camera.value.updateProjectionMatrix()
    controls.value.update()
  }, { immediate: true, deep: true })
  // Get camera target => update target (actually the model center)
  watch(cameraTarget, (newTarget) => {
    cancelPivotTransition()
    pivotTransition.clear()
    emit('orbitControlsPivotChanged', false)
    if (!controls.value)
      return
    controls.value.target.set(newTarget.x, newTarget.y, newTarget.z)
    controls.value.update()
  }, { immediate: true, deep: true })
  // Get fov => update camera fov
  watch(cameraFOV, (newFOV) => {
    if (!camera.value || !controls.value)
      return
    camera.value.fov = newFOV
    camera.value.updateProjectionMatrix()
    controls.value.update()
  }, { immediate: true })
  // Get camera distance => update camera distance
  watch(cameraDistance, (newDistance) => {
    if (pivotTransition.isInspectionActive || !camera.value || !controls.value)
      return
    const newPosition = new Vector3()
    const target = controls.value.target
    const direction = new Vector3().subVectors(camera.value.position, target).normalize()
    newPosition.copy(target).addScaledVector(direction, newDistance)
    camera.value.position.set(
      newPosition.x,
      newPosition.y,
      newPosition.z,
    )
    camera.value.updateProjectionMatrix()
    controls.value.update()
  })
  watch(controlEnable, (newEnable) => {
    if (!newEnable)
      cancelPivotTransition()
    if (!camera.value || !controls.value)
      return
    controls.value.enableRotate = newEnable
    controls.value.enableZoom = newEnable
  }, { immediate: true })

  /*
    * Upward info flow
    * - Emit info => update pinia store
  */
  // send camera update info
  const onChange = () => {
    if (pivotTransition.isInspectionActive || !controlEnable.value || !camera.value || !controls.value)
      return

    emit(
      'orbitControlsCameraChanged',
      {
        newCameraPosition: {
          x: camera.value.position.x,
          y: camera.value.position.y,
          z: camera.value.position.z,
        },
        newCameraDistance: controls.value.getDistance(),
      },
    )
  }

  disposeControlsChange?.()
  controls.value?.addEventListener('change', onChange)
  disposeControlsChange = () => controls.value?.removeEventListener('change', onChange)
}

function onControlStart() {
  emit('orbitControlsInteractionChanged', true)
}
function onControlEnd() {
  emit('orbitControlsInteractionChanged', false)
}

onMounted(async () => {
  // wait until camera is not undefined
  await until(() => cameraTres.value && renderer.domElement).toBeTruthy()
  if (!cameraTres.value || !renderer.domElement) {
    console.warn('Camera or Renderer initialisation failure!')
    return
  }
  // Narrow down the camera's type
  if (!(cameraTres.value instanceof PerspectiveCamera)) {
    console.warn('Camera is not perspective camera, type error!')
    return
  }
  camera.value = cameraTres.value as PerspectiveCamera
  // Obtain orbitControl instance
  controls.value = new OrbitControls(camera.value, renderer.domElement)
  controls.value.addEventListener('start', onControlStart)
  controls.value.addEventListener('end', onControlEnd)
  renderer.domElement.addEventListener('pointerdown', cancelPivotTransition)
  renderer.domElement.addEventListener('wheel', cancelPivotTransition, { passive: true })
  controls.value.enablePan = false
  controls.value.enableZoom = false
  controls.value.enableRotate = false
  // Align to tresjs conventions
  controls.value.mouseButtons = {
    LEFT: MOUSE.ROTATE,
    MIDDLE: MOUSE.DOLLY,
    RIGHT: MOUSE.PAN,
  }
  controls.value.touches = {
    ONE: TOUCH.ROTATE,
    TWO: TOUCH.DOLLY_PAN,
  }

  // define watch props and emit
  registerInfoFlow()
  controls.value.update()

  emit('orbitControlsReady')
})

onUnmounted(() => {
  cancelPivotTransition()
  renderer.domElement?.removeEventListener('pointerdown', cancelPivotTransition)
  renderer.domElement?.removeEventListener('wheel', cancelPivotTransition)
  disposeControlsChange?.()
  disposeControlsChange = undefined
  controls.value?.removeEventListener('start', onControlStart)
  controls.value?.removeEventListener('end', onControlEnd)
  controls.value?.dispose()
  controls.value = undefined
  camera.value = null
})

defineExpose({
  shiftTarget,
  cancelPivotTransition,
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
