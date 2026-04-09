<script setup lang="ts">
/*
  * MMD Scene Component
  * - Renders PMX/PMD models with optional VMD animations
  * - Uses TresJS for Three.js integration
*/

import type { TresContext } from '@tresjs/core'
import type { AnimationMixer, DirectionalLight, SphericalHarmonics3, Texture, Group as ThreeGroup, WebGLRenderer, WebGLRenderTarget } from 'three'
import type { CCDIKSolver } from 'three/examples/jsm/animation/CCDIKSolver.js'

import type { MmdLoadResult } from '../../composables/mmd'
import type { Vec3 } from '../../stores/model-store'

import { Screen } from '@proj-airi/ui'
import { TresCanvas } from '@tresjs/core'
import { EffectComposerPmndrs, HueSaturationPmndrs } from '@tresjs/post-processing'
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

import MMDAnimationLoop from './MMDAnimationLoop.vue'

import { loadMmd } from '../../composables/mmd'
import { useRenderTargetRegionAtClientPoint } from '../../composables/render-target'
import { useModelStore } from '../../stores/model-store'
import { OrbitControls } from '../Controls'
import { SkyBox } from '../Environment'

const props = withDefaults(defineProps<{
  modelSrc?: string
  skyBoxSrc?: string
  showAxes?: boolean
  vmdSrc?: string
  paused?: boolean
}>(), {
  showAxes: false,
  paused: false,
})

const emit = defineEmits<{
  (e: 'loadModelProgress', value: number): void
  (e: 'error', value: unknown): void
}>()

const componentState = defineModel<'pending' | 'loading' | 'mounted'>('state', { default: 'pending' })

const sceneContainerRef = ref<HTMLDivElement>()
const { width, height } = useElementBounding(sceneContainerRef)
const modelStore = useModelStore()
const {
  lastCommittedModelSrc,

  modelSize,
  modelOrigin,

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

  envSelect,
  skyBoxSrc,
} = storeToRefs(modelStore)

const camera = shallowRef(new PerspectiveCamera())
const controlsRef = shallowRef<InstanceType<typeof OrbitControls>>()
const tresCanvasRef = shallowRef<TresContext>()
const skyBoxEnvRef = ref<InstanceType<typeof SkyBox>>()
const dirLightRef = ref<InstanceType<typeof DirectionalLight>>()
const { readRenderTargetRegionAtClientPoint, disposeRenderTarget } = useRenderTargetRegionAtClientPoint({
  getRenderer: () => tresCanvasRef.value?.renderer.instance as WebGLRenderer | undefined,
  getScene: () => tresCanvasRef.value?.scene.value,
  getCamera: () => camera.value,
  getCanvas: () => tresCanvasRef.value?.renderer.instance.domElement,
})

const sceneReady = ref(false)
const modelLoaded = ref(false)
const controlEnable = ref(false)

// MMD specific refs
const mmdGroupRef = shallowRef<ThreeGroup | null>(null)
const mixerRef = shallowRef<AnimationMixer | null>(null)
const pendingMmdResult = shallowRef<MmdLoadResult | null>(null)
const ikSolverRef = shallowRef<CCDIKSolver | null>(null)
const ikEnabledRef = ref(false)

// Handle model loading
async function loadMmdModel() {
  if (!props.modelSrc) {
    return
  }

  componentState.value = 'loading'

  try {
    const result = await loadMmd(props.modelSrc, {
      vmdUrl: props.vmdSrc,
    })

    if (!result) {
      emit('error', 'Failed to load MMD model')
      return
    }

    // Store result for adding to scene
    pendingMmdResult.value = result

    // Try to add model to scene if TresCanvas is already ready
    addPendingModelToScene()

    // Update store with model info
    modelSize.value = {
      x: result.modelSize.x,
      y: result.modelSize.y,
      z: result.modelSize.z,
    }
    modelOrigin.value = {
      x: result.modelCenter.x,
      y: result.modelCenter.y,
      z: result.modelCenter.z,
    }
    cameraPosition.value = {
      x: result.initialCameraOffset.x,
      y: result.initialCameraOffset.y,
      z: result.initialCameraOffset.z,
    }

    lastCommittedModelSrc.value = props.modelSrc
    modelLoaded.value = true
    controlEnable.value = true
    componentState.value = 'mounted'
  }
  catch (err) {
    console.error('Failed to load MMD model:', err)
    emit('error', err)
  }
}

// Add pending model to scene when TresCanvas is ready
function addPendingModelToScene() {
  if (!pendingMmdResult.value)
    return

  const result = pendingMmdResult.value
  if (tresCanvasRef.value?.scene.value) {
    tresCanvasRef.value.scene.value.add(result.mmdGroup)
    mmdGroupRef.value = result.mmdGroup
    mixerRef.value = result.mixer ?? null
    ikSolverRef.value = result.ikSolver ?? null
    ikEnabledRef.value = result.ikEnabled ?? false
    pendingMmdResult.value = null // Clear pending after adding
  }
}

// Watch for model source changes
watch(() => props.modelSrc, (newSrc, oldSrc) => {
  if (newSrc && newSrc !== oldSrc) {
    loadMmdModel()
  }
}, { immediate: true })

// Start animation loop
onMounted(() => {
  if (envSelect.value === 'skyBox') {
    skyBoxEnvRef.value?.reload(skyBoxSrc.value)
  }
})

onUnmounted(() => {
  disposeRenderTarget()

  // Clean up MMD resources
  if (mmdGroupRef.value) {
    mmdGroupRef.value.traverse((child) => {
      const node = child as any
      if (node.geometry?.dispose)
        node.geometry.dispose()
      if (node.material) {
        const materials = Array.isArray(node.material) ? node.material : [node.material]
        for (const mat of materials) {
          if (mat?.map?.dispose)
            mat.map.dispose()
          mat?.dispose?.()
        }
      }
    })
  }

  // Clear pending model if not yet added to scene
  pendingMmdResult.value = null
})

// === OrbitControls ===
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

// === sky box ===
const irrSHTex = ref<SphericalHarmonics3 | null>(null)
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
  // Add pending model to scene if it was loaded before TresCanvas was ready
  addPendingModelToScene()
}

// Setup directional light when controls are ready and model is loaded
watch(
  [controlsReady, modelLoaded, dirLightRef],
  ([ctrlOk, loaded, dirLight]) => {
    if (!ctrlOk || !loaded || !dirLight || !camera.value || !controlsRef.value?.controls)
      return

    try {
      dirLight.parent?.add(dirLight.target)
      dirLight.target.position.set(
        directionalLightTarget.value.x,
        directionalLightTarget.value.y,
        directionalLightTarget.value.z,
      )
      dirLight.target.updateMatrixWorld()
      sceneReady.value = true
    }
    catch (error) {
      console.error('[MMDScene] Failed to setup directional light:', error)
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
}

watch(directionalLightRotation, (newRotation) => {
  updateDirLightTarget(newRotation)
}, { deep: true })

const effectProps = {
  saturation: 0.3,
  hue: 0,
  blendFunction: BlendFunction.SRC,
}

defineExpose({
  canvasElement: () => {
    return tresCanvasRef.value?.renderer.instance.domElement
  },
  camera: () => camera.value,
  renderer: () => tresCanvasRef.value?.renderer.instance,
  scene: () => mmdGroupRef.value,
  readRenderTargetRegionAtClientPoint,
})
</script>

<template>
  <Screen>
    <div ref="sceneContainerRef" class="h-full w-full">
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
          :control-enable="controlEnable"
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
        />
        <Suspense>
          <EffectComposerPmndrs>
            <HueSaturationPmndrs v-bind="effectProps" />
          </EffectComposerPmndrs>
        </Suspense>
        <TresAxesHelper v-if="props.showAxes" :size="1" />
        <!-- Animation loop component - must be inside TresCanvas context -->
        <MMDAnimationLoop
          v-if="modelLoaded"
          :mixer="mixerRef"
          :mmd-group="mmdGroupRef"
          :ik-solver="ikSolverRef"
          :ik-enabled="ikEnabledRef"
          :paused="props.paused"
        />
      </TresCanvas>
    </div>
  </Screen>
</template>
