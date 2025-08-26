<script setup lang="ts">
import type { TresContext } from '@tresjs/core'
import type { Texture,
} from 'three'

import { TresCanvas } from '@tresjs/core'
import { EffectComposerPmndrs, HueSaturationPmndrs } from '@tresjs/post-processing'
import { useElementBounding, useMouse } from '@vueuse/core'
import { formatHex } from 'culori'
import { storeToRefs } from 'pinia'
import { BlendFunction } from 'postprocessing'
import {
  ACESFilmicToneMapping,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Vector2,
  Vector3,
} from 'three'
import { onMounted, ref, shallowRef, watch } from 'vue'

import SkyBoxEnvironment from './VRM/SkyBoxEnvironment.vue'

import { useVRM } from '../../stores/vrm'
import { OrbitControls, VRMModel } from '../Scenes'

const props = withDefaults(defineProps<{
  modelSrc?: string
  showAxes?: boolean
  idleAnimation?: string
  paused?: boolean
}>(), {
  showAxes: false,
  idleAnimation: '/assets/vrm/animations/idle_loop.vrma',
  paused: false,
})

const emit = defineEmits<{
  (e: 'loadModelProgress', value: number): void
  (e: 'error', value: unknown): void
}>()

const { x: mouseX, y: mouseY } = useMouse()

const vrmContainerRef = ref<HTMLDivElement>()
const { width, height } = useElementBounding(vrmContainerRef)
const {
  cameraFOV,
  cameraPosition,
  cameraDistance,
  modelOrigin,
  trackingMode,
  lookAtTarget,
  eyeHeight,

  directionalLightPosition,
  directionalLightRotation,
  directionalLightIntensity,
  directionalLightColor,

  ambientLightIntensity,
  ambientLightColor,

  hemisphereLightIntensity,
  hemisphereSkyColor,
  hemisphereGroundColor,

  envSelect,
  skyBoxSrc,
} = storeToRefs(useVRM())

const modelRef = ref<InstanceType<typeof VRMModel>>()

const camera = shallowRef(new PerspectiveCamera())
const controlsRef = shallowRef<InstanceType<typeof OrbitControls>>()
const tresCanvasRef = shallowRef<TresContext>()
const skyBoxEnvRef = ref<InstanceType<typeof SkyBoxEnvironment>>()

function onTresReady(context: TresContext) {
  tresCanvasRef.value = context
}

const effectProps = {
  saturation: 0.3,
  hue: 0,
  blendFunction: BlendFunction.SRC,
}

let isUpdatingCamera = true
// manage the sequence of the camera and controls initialization
const controlsReady = ref(false)
const modelReady = ref(false)
const sceneReady = ref(false)
const raycaster = new Raycaster()
const mouse = new Vector2()

// For NPR skybox shader
const nprEquirectTex = ref<Texture | null>(null)

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
  }
})

// If model is ready
function handleLoadModelProgress() {
  modelReady.value = true
}

// Then start to set the camera position and target
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
    const newPosition = new Vector3()
    const target = controlsRef.value.controls.target
    const direction = new Vector3().subVectors(camera.value.position, target).normalize()
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

// Set looking target according to trackingMode
function lookAtCamera(newPosition: { x: number, y: number, z: number }) {
  modelRef.value?.lookAtUpdate(newPosition)
  lookAtTarget.value = newPosition
}

function lookAtMouse(mouseX: number, mouseY: number) {
  mouse.x = (mouseX / window.innerWidth) * 2 - 1
  mouse.y = -(mouseY / window.innerHeight) * 2 + 1

  // Raycast from the mouse position
  raycaster.setFromCamera(mouse, camera.value)

  // Create a plane in front of the camera
  const cameraDirection = new Vector3()
  camera.value.getWorldDirection(cameraDirection) // Get camera's forward direction

  const plane = new Plane()
  plane.setFromNormalAndCoplanarPoint(
    cameraDirection,
    camera.value.position.clone().add(cameraDirection.multiplyScalar(1)), // 1 unit in front of the camera
  )

  const intersection = new Vector3()
  raycaster.ray.intersectPlane(plane, intersection)
  lookAtTarget.value = { x: intersection.x, y: intersection.y, z: intersection.z }

  // Pass the target to the model
  modelRef.value?.lookAtUpdate(lookAtTarget.value)
}

watch(cameraPosition, (newPosition) => {
  if (!sceneReady.value || !modelRef.value)
    return
  if (trackingMode.value === 'camera') {
    lookAtCamera(newPosition)
  }
}, { deep: true })

watch([mouseX, mouseY], () => {
  if (!sceneReady.value || !modelRef.value)
    return
  if (trackingMode.value === 'mouse') {
    lookAtMouse(mouseX.value, mouseY.value)
  }
})

watch(trackingMode, (newMode) => {
  if (!sceneReady.value || !modelRef.value)
    return
  if (newMode === 'camera') {
    lookAtCamera(cameraPosition.value)
  }
  else if (newMode === 'mouse') {
    lookAtMouse(mouseX.value, mouseY.value)
  }
  else {
    lookAtTarget.value = {
      x: 0,
      y: eyeHeight.value,
      z: -1000,
    }
  }
})

onMounted(() => {
  if (envSelect.value === 'skyBox') {
    skyBoxEnvRef.value?.reload(skyBoxSrc.value)
  }
})

defineExpose({
  setExpression: (expression: string) => {
    modelRef.value?.setExpression(expression)
  },
  canvasElement: () => {
    return tresCanvasRef.value?.renderer.value.domElement
  },
})
</script>

<template>
  <div ref="vrmContainerRef" w="100%" h="100%">
    <TresCanvas
      v-if="camera" v-show="sceneReady"
      :camera="camera"
      :antialias="true"
      :width="width"
      :height="height"
      :tone-mapping="ACESFilmicToneMapping"
      :tone-mapping-exposure="1"
      :preserve-drawing-buffer="true"
      @ready="onTresReady"
    >
      <OrbitControls ref="controlsRef" />
      <SkyBoxEnvironment
        v-if="envSelect === 'skyBox'"
        ref="skyBoxEnvRef"
        :sky-box-src="skyBoxSrc"
        :as-background="true"
        @equirect-skybox-ready="(tex) => nprEquirectTex = tex"
      />
      <TresHemisphereLight
        v-else
        :color="formatHex(hemisphereSkyColor)"
        :ground-color="formatHex(hemisphereGroundColor)"
        :position="[0, 1, 0]"
        :intensity="hemisphereLightIntensity"
        cast-shadow
      />
      <TresAmbientLight
        :color="formatHex(ambientLightColor)"
        :intensity="ambientLightIntensity"
        cast-shadow
      />
      <TresDirectionalLight
        :color="formatHex(directionalLightColor)"
        :position="[directionalLightPosition.x, directionalLightPosition.y, directionalLightPosition.z]"
        :rotation="[directionalLightRotation.x, directionalLightRotation.y, directionalLightRotation.z]"
        :intensity="directionalLightIntensity"
        cast-shadow
      />
      <Suspense>
        <EffectComposerPmndrs>
          <HueSaturationPmndrs v-bind="effectProps" />
        </EffectComposerPmndrs>
      </Suspense>
      <VRMModel
        ref="modelRef"
        :model-src="props.modelSrc"
        :idle-animation="props.idleAnimation"
        :paused="props.paused"
        :npr-equirect-tex="nprEquirectTex"
        @load-model-progress="(val) => emit('loadModelProgress', val)"
        @model-ready="handleLoadModelProgress"
        @error="(val) => emit('error', val)"
      />
      <TresAxesHelper v-if="props.showAxes" :size="1" />
    </TresCanvas>
  </div>
</template>
