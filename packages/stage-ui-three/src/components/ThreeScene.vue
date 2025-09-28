<script setup lang="ts">
/*
  * - Root vue component of stage-ui-three package
  * - This scene component the root for all the sub components in the 3d scene
  * - This package, stage-ui-three, is a stateful package
  * - Pinia store is used to store the data/configuration of the model, camera, lighting, etc.
  * - Src of model is obtained from stage-ui via props, which is NOT a part of stage-ui-three package
*/

import type { TresContext } from '@tresjs/core'
import type { DirectionalLight, SphericalHarmonics3, Texture, WebGLRenderTarget } from 'three'

import type { Vec3 } from '../stores/model-store'

import { EffectComposerPmndrs, HueSaturationPmndrs } from '@proj-airi/tresjs/post-processing'
import { TresCanvas } from '@tresjs/core'
import { useElementBounding } from '@vueuse/core'
import { formatHex } from 'culori'
import { storeToRefs } from 'pinia'
import { BlendFunction } from 'postprocessing'
import {
  ACESFilmicToneMapping,
  Euler,
  MathUtils,
  PerspectiveCamera,
  Vector3,
} from 'three'
import { onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'

// pinia store
import { useModelStore } from '../stores/model-store'
// From stage-ui-three package
import { OrbitControls } from './Controls'
import { SkyBox } from './Environment'
import { VRMModel } from './Model'

const props = withDefaults(defineProps<{
  modelSrc?: string
  skyBoxSrc?: string
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

const sceneContainerRef = ref<HTMLDivElement>()
const { width, height } = useElementBounding(sceneContainerRef)
const modelStore = useModelStore()
const {
  lastModelSrc,

  modelSize,
  modelOrigin,
  modelOffset,
  modelRotationY,

  cameraFOV,
  cameraPosition,
  cameraDistance,

  directionalLightPosition,
  directionalLightTarget,
  directionalLightRotation,
  directionalLightIntensity,
  directionalLightColor,

  ambientLightIntensity,
  ambientLightColor,

  hemisphereSkyColor,
  hemisphereGroundColor,
  hemisphereLightIntensity,

  lookAtTarget,
  trackingMode,
  eyeHeight,
  envSelect,
  skyBoxSrc,
  skyBoxIntensity,
} = storeToRefs(modelStore)

const modelRef = ref<InstanceType<typeof VRMModel>>()

const camera = shallowRef(new PerspectiveCamera())
const controlsRef = shallowRef<InstanceType<typeof OrbitControls>>()
const tresCanvasRef = shallowRef<TresContext>()
const skyBoxEnvRef = ref<InstanceType<typeof SkyBox>>()
const dirLightRef = ref<InstanceType<typeof DirectionalLight>>()

/*
  * Pinia store definition
  * - Lilia: We highly recommend you gather all the store data definition here
  * - Only this root component (ThreeScene) can directly access pinia store
*/
// TODO: remove the hard-coded pinia store and inject the data from here

/*
  * Handle upward info flow
  * - Sub components emit info => update pinia store
*/
// === OrbitControls ===
// Get camera update => update camera info in pinia
function onOrbitControlsCameraChanged(value: {
  newCameraPosition: Vec3
  newCameraDistance: number
}) {
  const posChanged = Math.abs(cameraPosition.value.x - value.newCameraPosition.x) > 1e-6
    || Math.abs(cameraPosition.value.y - value.newCameraPosition.y) > 1e-6
    || Math.abs(cameraPosition.value.z - value.newCameraPosition.z) > 1e-6
  if (posChanged) {
    cameraPosition.value = value.newCameraPosition
  }
  const distChanged = Math.abs(cameraDistance.value - value.newCameraDistance) > 1e-6
  if (distChanged) {
    cameraDistance.value = value.newCameraDistance
  }
}
const controlsReady = ref(false)
function onOrbitControlsReady() {
  controlsReady.value = true
}

//  === VRMModel ===
const modelLoaded = ref<boolean>(false)
function onVRMModelLoadStart() {
  modelLoaded.value = false
}
function onVRMModelCameraPosition(value: Vec3) {
  cameraPosition.value.x = value.x
  cameraPosition.value.y = value.y
  cameraPosition.value.z = value.z
}
function onVRMModelModelOrigin(value: Vec3) {
  modelOrigin.value.x = value.x
  modelOrigin.value.y = value.y
  modelOrigin.value.z = value.z
}
function onVRMModelModelSize(value: Vec3) {
  modelSize.value.x = value.x
  modelSize.value.y = value.y
  modelSize.value.z = value.z
}
function onVRMModelRotationY(value: number) {
  modelRotationY.value = value
}
function onVRMModelEyeHeight(value: number) {
  eyeHeight.value = value
}
function onVRMModelLookAtTarget(value: Vec3) {
  lookAtTarget.value.x = value.x
  lookAtTarget.value.y = value.y
  lookAtTarget.value.z = value.z
}
function onVRMModelLoaded(value: string) {
  lastModelSrc.value = value
  modelLoaded.value = true
}

// === sky box ===
const irrSHTex = ref<SphericalHarmonics3 | null>(null)
// Update irrSH for IBL
function onSkyBoxReady(EnvPayload: {
  hdri?: Texture | null
  pmrem?: WebGLRenderTarget | null
  irrSH: SphericalHarmonics3 | null
}) {
  irrSHTex.value = EnvPayload.irrSH || null
}

// === Tres Canvas ===
function onTresReady(context: TresContext) {
  tresCanvasRef.value = context
}

onMounted(() => {
  if (envSelect.value === 'skyBox') {
    skyBoxEnvRef.value?.reload(skyBoxSrc.value)
  }
})

onUnmounted(() => {})

const effectProps = {
  saturation: 0.3,
  hue: 0,
  blendFunction: BlendFunction.SRC,
}

// === Directional Light ===
// TODO: wrap <TresDirectionalLight> to integrate all the below code
const sceneReady = ref(false)
const dirLightReady = ref(false)

function onDirLightReady() {
  dirLightReady.value = true
}
// Then start to set the camera position and target
watch(
  [controlsReady, dirLightReady],
  ([ctrlOk, modelOk]) => {
    if (ctrlOk && modelOk && camera.value && controlsRef.value && controlsRef.value.controls && dirLightRef.value) {
      // isUpdatingCamera = true
      try {
        // setup initial target of directional light
        dirLightRef.value.parent?.add(dirLightRef.value.target)
        dirLightRef.value.target.position.set(
          directionalLightTarget.value.x,
          directionalLightTarget.value.y,
          directionalLightTarget.value.z,
        )
        // console.debug("direction light target set: ", dirLightRef.value.target.position)
        dirLightRef.value.target.updateMatrixWorld()
      }
      finally {
        // isUpdatingCamera = false
        sceneReady.value = true
      }
    }
  },
)

function updateDirLightTarget(newRotation: { x: number, y: number, z: number }) {
  const light = dirLightRef.value
  if (!light)
    return

  const { x: rx, y: ry, z: rz } = newRotation
  const lightPosition = new Vector3(
    directionalLightPosition.value.x,
    directionalLightPosition.value.y,
    directionalLightPosition.value.z,
  )
  const origin = new Vector3(0, 0, 0)
  const euler = new Euler(
    MathUtils.degToRad(rx),
    MathUtils.degToRad(ry),
    MathUtils.degToRad(rz),
    'XYZ',
  )
  const initialForward = origin.clone().sub(lightPosition).normalize()
  const newForward = initialForward.applyEuler(euler).normalize()
  const distance = lightPosition.distanceTo(origin)
  const target = lightPosition.clone().addScaledVector(newForward, distance)

  light.target.position.copy(target)

  light.target.updateMatrixWorld()

  directionalLightTarget.value = { x: target.x, y: target.y, z: target.z }
  // console.debug("directional Light target update!: ", directionalLightTarget.value)
}

watch(directionalLightRotation, (newRotation) => {
  updateDirLightTarget(newRotation)
}, { deep: true })

defineExpose({
  setExpression: (expression: string) => {
    modelRef.value?.setExpression(expression)
  },
  canvasElement: () => {
    return tresCanvasRef.value?.renderer.instance.domElement
  },
})
</script>

<template>
  <div ref="sceneContainerRef" w="100%" h="100%">
    <TresCanvas
      v-show="true"
      :camera="camera"
      :antialias="true"
      :width="width"
      :height="height"
      :tone-mapping="ACESFilmicToneMapping"
      :tone-mapping-exposure="1"
      :clear-alpha="0"
      @ready="onTresReady"
    >
      <OrbitControls
        ref="controlsRef"
        :model-loaded="modelLoaded"
        :model-size="modelSize"
        :camera-position="cameraPosition"
        :camera-target="modelOrigin"
        :camera-f-o-v="cameraFOV"
        :camera-distance="cameraDistance"
        @orbit-controls-camera-changed="onOrbitControlsCameraChanged"
        @orbit-controls-ready="onOrbitControlsReady"
      />
      <SkyBox
        v-if="envSelect === 'skyBox'"
        ref="skyBoxEnvRef"
        :sky-box-src="skyBoxSrc"
        :as-background="true"
        @sky-box-ready="onSkyBoxReady"
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
        ref="dirLightRef"
        :color="formatHex(directionalLightColor)"
        :position="[directionalLightPosition.x, directionalLightPosition.y, directionalLightPosition.z]"
        :intensity="directionalLightIntensity"
        cast-shadow
        @ready="onDirLightReady"
      />
      <Suspense>
        <EffectComposerPmndrs>
          <HueSaturationPmndrs v-bind="effectProps" />
        </EffectComposerPmndrs>
      </Suspense>
      <VRMModel
        ref="modelRef"

        :model-src="props.modelSrc"
        :last-model-src="lastModelSrc"
        :idle-animation="props.idleAnimation"
        :paused="props.paused"
        :env-select="envSelect"
        :sky-box-intensity="skyBoxIntensity"
        :npr-irr-s-h="irrSHTex"
        :model-offset="modelOffset"
        :model-rotation-y="modelRotationY"
        :look-at-target="lookAtTarget"
        :tracking-mode="trackingMode"
        :eye-height="eyeHeight"
        :camera-position="cameraPosition"
        :camera="camera"

        @loading-progress="(val: number) => emit('loadModelProgress', val)"
        @load-start="onVRMModelLoadStart"
        @camera-position="onVRMModelCameraPosition"
        @model-origin="onVRMModelModelOrigin"
        @model-size="onVRMModelModelSize"
        @model-rotation-y="onVRMModelRotationY"
        @eye-height="onVRMModelEyeHeight"
        @look-at-target="onVRMModelLookAtTarget"
        @error="(err: unknown) => emit('error', err)"
        @loaded="onVRMModelLoaded"
      />
      <TresAxesHelper v-if="props.showAxes" :size="1" />
    </TresCanvas>
  </div>
</template>
