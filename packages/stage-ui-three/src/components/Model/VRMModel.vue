<script setup lang="ts">
/*
  * - Core component for loading and displaying VRM model
  * - Load model, get some geometry data for initialisation
  * - Shader injection and rendering setting
  * - Load & initialise animation
*/

import type { VRM } from '@pixiv/three-vrm'
import type {
  Group,
  Object3D,
  PerspectiveCamera,
  ShaderMaterial,
  SphericalHarmonics3,
  Texture,
} from 'three'
import type { Ref, WatchStopHandle } from 'vue'

import type { Vec3 } from '../../stores/model-store'

import { VRMUtils } from '@pixiv/three-vrm'
import { useLoop, useTresContext } from '@tresjs/core'
import { until, useMouse } from '@vueuse/core'
import {
  AnimationMixer,
  MathUtils,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Plane,
  Raycaster,

  SRGBColorSpace,
  Vector2,
  Vector3,
} from 'three'
import {
  computed,
  onMounted,
  onUnmounted,
  ref,

  shallowRef,

  toRefs,
  watch,

} from 'vue'

import {
  createIblProbeController,
  injectDiffuseIBL,
  normalizeEnvMode,
  updateNprShaderSetting,
} from '../../composables/shader/ibl'
// From stage-ui-three package
import {
  clipFromVRMAnimation,
  loadVRMAnimation,
  reAnchorRootPositionTrack,
  useBlink,
  useIdleEyeSaccades,
} from '../../composables/vrm/animation'
import { loadVrm } from '../../composables/vrm/core'
import { useVRMEmote } from '../../composables/vrm/expression'
import { useVRMLipSync } from '../../composables/vrm/lip-sync'

/*
  * Props:
  * - modelSrc: model src string to load model asset
  * - idleAnimation: animation src for model
  * - loadAnimations: TBC
  * - paused: if the animation is paused
  * - nprIrrSH: Spherical Harmonics computed from the sky box, used for IBL
  *
  * - modelOffset: The placing offset of model (x, y, z)
  * - modelRotationY: The rotation of the model (y-axis)
*/
const props = withDefaults(defineProps<{
  currentAudioSource?: AudioBufferSourceNode
  modelSrc?: string
  lastModelSrc?: string
  idleAnimation: string
  // loadAnimations?: string[]
  paused?: boolean

  envSelect: string
  skyBoxIntensity: number
  nprIrrSH?: SphericalHarmonics3 | null

  modelOffset: Vec3
  modelRotationY: number
  lookAtTarget: Vec3
  trackingMode: string
  eyeHeight: number
  cameraPosition: Vec3

  camera: PerspectiveCamera
}>(), {
  paused: false,
})
/*
  * Emits:
  * - model-core-loading-progress
  * - model-core-error
  * - model-core-ready
  *
*/
const emit = defineEmits<{
  (e: 'loadingProgress', value: number): void
  (e: 'loadStart'): void
  (e: 'cameraPosition', value: Vec3): void
  (e: 'modelOrigin', value: Vec3): void
  (e: 'modelSize', value: Vec3): void
  (e: 'modelRotationY', value: number): void
  (e: 'eyeHeight', value: number): void
  (e: 'lookAtTarget', value: Vec3): void

  (e: 'error', value: unknown): void
  (e: 'loaded', value: string): void
}>()

const {
  currentAudioSource,
  modelSrc,
  lastModelSrc,
  idleAnimation,
  // loadAnimations, // TBC
  paused,

  envSelect,
  skyBoxIntensity,
  nprIrrSH,

  modelOffset,
  modelRotationY,
  lookAtTarget,
  trackingMode,
  eyeHeight,
  cameraPosition,

  camera,
} = toRefs(props)

// Model and scene ref
const { scene } = useTresContext()
const vrm = shallowRef<VRM>()
const vrmGroup = shallowRef<Group>()
const modelLoaded = ref<boolean>(false)
// for eye tracking modes
const { x: mouseX, y: mouseY } = useMouse()
const raycaster = new Raycaster()
const mouse = new Vector2()
const mouseTarget = shallowRef<Vec3>()
let stopMouseWatch: WatchStopHandle | undefined
let stopCameraWatch: WatchStopHandle | undefined

// Animation related ref
const vrmAnimationMixer = ref<AnimationMixer>()
const { onBeforeRender, stop, start } = useLoop()

type VrmFrameHook = (vrm: VRM, delta: number) => void
const vrmFrameHook = shallowRef<VrmFrameHook>()
let disposeBeforeRenderLoop: (() => void | undefined)

// Expressions
const blink = useBlink()
const idleEyeSaccades = useIdleEyeSaccades()
const vrmEmote = ref<ReturnType<typeof useVRMEmote>>()
const vrmLipSync = useVRMLipSync(currentAudioSource)

// For sky box update
const nprProgramVersion = ref(0)
// For MToon IBL
let airiIblProbe: ReturnType<typeof createIblProbeController> | null = null

// clean the previous vrm model loaded
function componentCleanUp() {
  // clear animation
  disposeBeforeRenderLoop?.()
  // clear vrm group
  if (vrmGroup.value) {
    vrmGroup.value.removeFromParent()
  }
  // deep clear
  if (vrm.value) {
    // TODO: after bumping up to three 0.180.0 with @types/three 0.180.0,
    //   Argument of type 'Group<Object3DEventMap>' is not assignable to parameter of type 'Object3D<Object3DEventMap>'.
    //     Type 'Group<Object3DEventMap>' is missing the following properties from type 'Object3D<Object3DEventMap>': setPointerCapture, releasePointerCapture, hasPointerCapture
    //
    // Currently, AFAIK, https://github.com/pmndrs/xr/blob/456aa380206e93888cd3a5741a1534e672ae3106/packages/pointer-events/src/pointer.ts#L69-L100 declares
    // declare module 'three' {
    //   interface Object3D {
    //     setPointerCapture(pointerId: number): void
    //     releasePointerCapture(pointerId: number): void
    //     hasPointerCapture(pointerId: number): boolean

    //     intersectChildren?: boolean
    //     interactableDescendants?: Array<Object3D>
    //     /**
    //      * @deprecated
    //      */
    //     ancestorsHaveListeners?: boolean
    //     ancestorsHavePointerListeners?: boolean
    //     ancestorsHaveWheelListeners?: boolean
    //   }
    // }
    //
    // And in @tresjs/core v5, it uses the @pmndrs/pointer-events internally.
    // Somehow the Object3D from @types/three and the one augmented by @pmndrs/pointer-events are not compatible.
    // This needs to be fixed later.
    VRMUtils.deepDispose(vrm.value.scene as unknown as Object3D)
  }
  // clear IBL probe
  airiIblProbe?.dispose()
  airiIblProbe = null
}

// look at mouse
function lookAtMouse(
  mouseX: number,
  mouseY: number,
  camera: Ref<PerspectiveCamera>,
): Vec3 {
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
  return { x: intersection.x, y: intersection.y, z: intersection.z }
}

function defaultTookAt(eyeHeight: number): Vec3 {
  return {
    x: 0,
    y: eyeHeight,
    z: -100,
  }
}

async function loadModel() {
  try {
    if (!scene.value) {
      console.warn('Scene is not ready, cannot load VRM model.')
      return
    }
    if (vrmGroup.value) {
      componentCleanUp()
    }
    if (!modelSrc.value) {
      console.warn('NO model src, cannot load VRM model.')
      return
    }
    // First load or not? if yes then reset the pinia store
    const isFirstLoad = modelSrc.value !== lastModelSrc.value

    try {
      emit('loadStart')
      // Load vrm model
      modelLoaded.value = false
      const _vrmInfo = await loadVrm(modelSrc.value, {
        scene: scene.value,
        lookAt: true,
        onProgress: progress => emit(
          'loadingProgress',
          Number((100 * progress.loaded / progress.total).toFixed(2)),
        ),
      })
      if (!_vrmInfo || !_vrmInfo._vrm || !_vrmInfo?._vrmGroup) {
        console.warn('VRM model loading failure!')
        return
      }
      const {
        _vrm,
        _vrmGroup,
        modelCenter: vrmModelCenter,
        modelSize: vrmModelSize,
        initialCameraOffset: vrmInitialCameraOffset,
      } = _vrmInfo

      /*
        * Model setting
      */
      vrm.value = _vrm
      vrmGroup.value = _vrmGroup
      // If it's first load
      if (isFirstLoad) {
        emit('cameraPosition', {
          x: vrmModelCenter.x + vrmInitialCameraOffset.x,
          y: vrmModelCenter.y + vrmInitialCameraOffset.y,
          z: vrmModelCenter.z + vrmInitialCameraOffset.z,
        })
        emit('modelOrigin', {
          x: vrmModelCenter.x,
          y: vrmModelCenter.y,
          z: vrmModelCenter.z,
        })
        emit('modelSize', {
          x: vrmModelSize.x,
          y: vrmModelSize.y,
          z: vrmModelSize.z,
        })
      }

      // Set model facing direction
      // Lilia: I brought forward the rotation to the core.ts, so that any ad-hoc rotation will not impact the model centre position.
      if (isFirstLoad) {
        // Reset model rotation Y
        emit('modelRotationY', 0)
      }

      /*
        * Animation setting
      */
      const animation = await loadVRMAnimation(idleAnimation.value)
      const clip = await clipFromVRMAnimation(_vrm, animation)
      if (!clip) {
        console.warn('No VRM animation loaded')
        return
      }
      // Re-anchor the root position track to the model origin
      reAnchorRootPositionTrack(clip, _vrm)

      // play animation
      vrmAnimationMixer.value = new AnimationMixer(_vrm.scene)
      vrmAnimationMixer.value.clipAction(clip).play()

      vrmEmote.value = useVRMEmote(_vrm)

      /*
        * Shader setting
      */
      // material selection
      function isMToon(mat: any): boolean {
        return !!(mat?.isShaderMaterial && mat.userData?.vrmMaterialType === 'MToon'
        )
      }
      const isShaderMat = (m: any): m is ShaderMaterial => !!m?.isShaderMaterial

      // refactoring
      // MToon material sky box lightProbe setting
      if (!airiIblProbe && scene.value)
        airiIblProbe = createIblProbeController(scene.value)

      // Material traverse setting
      _vrm.scene.traverse((child) => {
        if (child instanceof Mesh && child.material) {
          const material = Array.isArray(child.material) ? child.material : [child.material]
          material.forEach((mat) => {
            // console.debug("shader material: ", mat)
            if (mat instanceof MeshStandardMaterial || mat instanceof MeshPhysicalMaterial) {
              // Should read envMap intensity from outside props
              mat.envMapIntensity = 1.0
              mat.needsUpdate = true
            }
            else if (isMToon(mat)) {
              // --- MToon material, add IBL lightProbe only ---
              // close tone mapping for NPR materials
              if ('toneMapped' in mat)
                mat.toneMapped = false
            }
            else if (isShaderMat(mat)) {
              // --- Shader material, further IBL injection needed ---
              // console.debug("Mat: ", mat)
              // TODO: stylised shader injection
              // Lilia: I plan to replace all injected shader code to be my own, so that it can always avoid double injection and unknown user upload VRM injected shader behaviour...
              if ('toneMapped' in mat)
                mat.toneMapped = false
              if ('envMap' in mat && mat.envMap)
                mat.envMap = null
              // NPR materials usually use sRGB textures
              const tex = (mat as any).map as Texture | undefined
              if (tex && (tex as any).colorSpace !== undefined) {
                try {
                  (tex as any).colorSpace = SRGBColorSpace
                }
                catch (e) {
                  console.warn('Failed to set colorSpace on texture:', e)
                }
              }
              injectDiffuseIBL(mat)
            }
          })
        }
      })

      /*
        * Eye tracking setting
      */
      function getEyePosition(): number | null {
        const eye = vrm.value?.humanoid?.getNormalizedBoneNode('head')
        if (!eye)
          return null
        const eyePos = new Vector3()
        eye.getWorldPosition(eyePos)
        return eyePos.y
      }
      if (isFirstLoad) {
        const eyePositionY = getEyePosition()
        if (eyePositionY) {
          emit('eyeHeight', eyePositionY)
          emit('lookAtTarget', defaultTookAt(eyePositionY))
        }
      }

      // Clean up & animation setting
      disposeBeforeRenderLoop = onBeforeRender(({ delta }) => {
        vrmAnimationMixer.value?.update(delta)
        const activeVrm = vrm.value
        if (activeVrm && vrmFrameHook.value) {
          try {
            vrmFrameHook.value(activeVrm, delta)
          }
          catch (err) {
            console.error(err)
            emit('error', err)
          }
        }
        activeVrm?.humanoid.update()
        activeVrm?.lookAt?.update?.(delta)
        blink.update(activeVrm, delta)
        idleEyeSaccades.update(activeVrm, lookAtTarget, delta)
        vrmEmote.value?.update(delta)
        vrmLipSync.update(activeVrm, delta)
        activeVrm?.expressionManager?.update()
        activeVrm?.springBoneManager?.update(delta)
      }).off

      // update the 'last model src'
      emit('loaded', modelSrc.value)
      modelLoaded.value = true
    }
    catch (err) {
      console.error(err)
      emit('error', err)
    }
  }
  catch (err) {
    console.error(err)
    emit('error', err)
  }
}

onMounted(async () => {
  // wait until scene is not undefined
  await until(() => scene.value).toBeTruthy()
  await loadModel()

  /*
    * Downward info flow
    * - Pinia store value updated => command take effect
  */
  // watch if the model needs to be reloaded
  watch(modelSrc, (newSrc, oldSrc) => {
    if (newSrc !== oldSrc) {
      loadModel()
    }
  })
  // watch if the animation should be paused
  watch(paused, (isPaused) => {
    if (isPaused) {
      stop()
    }
    else {
      start()
    }
  }, { immediate: true })
  // update model position
  watch(modelOffset, () => {
    if (vrmGroup.value) {
      vrmGroup.value.position.set(
        modelOffset.value.x,
        modelOffset.value.y,
        modelOffset.value.z,
      )
    }
  }, { immediate: true, deep: true })
  // update model rotation
  watch(modelRotationY, (newRotationY) => {
    if (vrmGroup.value) {
      vrmGroup.value.rotation.y = MathUtils.degToRad(newRotationY)
    }
  }, { immediate: true })
  // update NPR sky box
  watch([envSelect, skyBoxIntensity, nprIrrSH], async () => {
    if (!vrm.value)
      return
    // force the program to flush
    nprProgramVersion.value += 1
    const mode = normalizeEnvMode(envSelect.value)

    // TODO: after bumping up to three 0.180.0 with @types/three 0.180.0,
    //   Argument of type 'Group<Object3DEventMap>' is not assignable to parameter of type 'Object3D<Object3DEventMap>'.
    //     Type 'Group<Object3DEventMap>' is missing the following properties from type 'Object3D<Object3DEventMap>': setPointerCapture, releasePointerCapture, hasPointerCapture
    //
    // Currently, AFAIK, https://github.com/pmndrs/xr/blob/456aa380206e93888cd3a5741a1534e672ae3106/packages/pointer-events/src/pointer.ts#L69-L100 declares
    // declare module 'three' {
    //   interface Object3D {
    //     setPointerCapture(pointerId: number): void
    //     releasePointerCapture(pointerId: number): void
    //     hasPointerCapture(pointerId: number): boolean

    //     intersectChildren?: boolean
    //     interactableDescendants?: Array<Object3D>
    //     /**
    //      * @deprecated
    //      */
    //     ancestorsHaveListeners?: boolean
    //     ancestorsHavePointerListeners?: boolean
    //     ancestorsHaveWheelListeners?: boolean
    //   }
    // }
    //
    // And in @tresjs/core v5, it uses the @pmndrs/pointer-events internally.
    // Somehow the Object3D from @types/three and the one augmented by @pmndrs/pointer-events are not compatible.
    // This needs to be fixed later.
    updateNprShaderSetting(vrm.value?.scene as unknown as Object3D, {
      mode,
      intensity: skyBoxIntensity.value,
      sh: nprIrrSH.value ?? null,
    })
    airiIblProbe?.update(mode, skyBoxIntensity.value, nprIrrSH.value ?? null)
  }, { immediate: true })
  // update eye tracking mode
  watch(trackingMode, (newMode) => {
    stopCameraWatch?.()
    stopCameraWatch = undefined
    stopMouseWatch?.()
    stopMouseWatch = undefined
    if (newMode === 'camera') {
      stopCameraWatch = watch(cameraPosition, (newPosition) => {
        // watch to update look at target to camera
        emit('lookAtTarget', newPosition)
      }, { immediate: true, deep: true })
    }
    else if (newMode === 'mouse') {
      stopMouseWatch = watch([mouseX, mouseY], ([newX, newY]) => {
        mouseTarget.value = lookAtMouse(newX, newY, camera)
        // watch to update look at target to mouse
        emit('lookAtTarget', mouseTarget.value)
      }, { immediate: true, deep: true })
    }
    else {
      emit('lookAtTarget', defaultTookAt(eyeHeight.value))
    }
  }, { immediate: true })
  watch(lookAtTarget, (newTarget) => {
    idleEyeSaccades.instantUpdate(vrm.value, newTarget)
  }, { deep: true })
})

onUnmounted(() => componentCleanUp())

if (import.meta.hot) {
  // Ensure cleanup on HMR
  import.meta.hot.dispose(() => {
    componentCleanUp()
  })
}

defineExpose({
  setExpression(expression: string) {
    vrmEmote.value?.setEmotionWithResetAfter(expression, 1000)
  },
  setVrmFrameHook(hook?: VrmFrameHook) {
    vrmFrameHook.value = hook
  },
  scene: computed(() => vrm.value?.scene),
  lookAtUpdate(target: Vec3) {
    idleEyeSaccades.instantUpdate(vrm.value, target)
  },
})
</script>

<template>
  <slot v-if="modelLoaded" />
</template>
