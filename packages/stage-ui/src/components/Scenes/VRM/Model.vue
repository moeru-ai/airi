<script setup lang="ts">
import type { VRMCore } from '@pixiv/three-vrm-core'
import type { AnimationClip, Group } from 'three'

import { VRMUtils } from '@pixiv/three-vrm'
import { useLoop, useTresContext } from '@tresjs/core'
import { until } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { AnimationMixer, MathUtils, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Quaternion, Vector3, VectorKeyframeTrack } from 'three'
import { computed, onMounted, onUnmounted, ref, toRef, watch } from 'vue'

import { clipFromVRMAnimation, loadVRMAnimation, useBlink, useIdleEyeSaccades } from '../../../composables/vrm/animation'
import { loadVrm } from '../../../composables/vrm/core'
import { useVRMEmote } from '../../../composables/vrm/expression'
import { useVRM } from '../../../stores/vrm'

const props = defineProps<{
  modelSrc?: string

  idleAnimation: string
  loadAnimations?: string[]
  paused: boolean
}>()

const emit = defineEmits<{
  (e: 'loadModelProgress', value: number): void
  (e: 'error', value: unknown): void
  (e: 'modelReady'): void
}>()

let disposeBeforeRenderLoop: (() => void | undefined)

const modelLoading = ref(false)
const modelLoaded = ref(false)
const modelSrcRef = toRef(() => props.modelSrc)

const vrm = ref<VRMCore>()
const vrmAnimationMixer = ref<AnimationMixer>()
const { scene } = useTresContext()
const { onBeforeRender } = useLoop()
const blink = useBlink()
const vrmEmote = ref<ReturnType<typeof useVRMEmote>>()

const vrmStore = useVRM()
const {
  modelOffset,
  modelOrigin,
  modelSize,
  cameraPosition,
  modelRotationY,
  lookAtTarget,
  eyeHeight,
  trackingMode,
} = storeToRefs(vrmStore)
const vrmGroup = ref<Group>()
const idleEyeSaccades = useIdleEyeSaccades()

async function loadModel() {
  await until(modelLoading).not.toBeTruthy()
  modelLoading.value = true
  modelLoaded.value = false

  try {
    if (!scene.value) {
      console.warn('Scene is not ready, cannot load VRM model.')
      return
    }
    if (vrm.value) {
      componentCleanUp()
    }
    if (!modelSrcRef.value) {
      return
    }

    try {
      const _vrmInfo = await loadVrm(modelSrcRef.value, {
        scene: scene.value,
        lookAt: true,
        onProgress: progress => emit('loadModelProgress', Number((100 * progress.loaded / progress.total).toFixed(2))),
      })
      if (!_vrmInfo || !_vrmInfo._vrm) {
        console.warn('No VRM model loaded')
        return
      }
      const {
        _vrm,
        _vrmGroup,
        modelCenter: vrmModelCenter,
        modelSize: vrmModelSize,
        initialCameraOffset: vrmInitialCameraOffset,
      } = _vrmInfo

      vrmGroup.value = _vrmGroup

      // Set initial camera position
      cameraPosition.value = {
        x: vrmModelCenter.x + vrmInitialCameraOffset.x,
        y: vrmModelCenter.y + vrmInitialCameraOffset.y,
        z: vrmModelCenter.z + vrmInitialCameraOffset.z,
      }
      // cameraDistance.value = vrmInitialCameraOffset.length()

      // Set initial positions for model
      modelOrigin.value = {
        x: vrmModelCenter.x,
        y: vrmModelCenter.y,
        z: vrmModelCenter.z,
      }
      modelSize.value = {
        x: vrmModelSize.x,
        y: vrmModelSize.y,
        z: vrmModelSize.z,
      }

      vrmGroup.value.position.set(
        modelOffset.value.x,
        modelOffset.value.y,
        modelOffset.value.z,
      )

      // Set model facing direction
      const targetDirection = new Vector3(0, 0, -1) // Default facing direction
      const lookAt = _vrm.lookAt
      const quaternion = new Quaternion()
      if (lookAt) {
        const facingDirection = lookAt.faceFront
        quaternion.setFromUnitVectors(facingDirection.normalize(), targetDirection.normalize())
        _vrmGroup.quaternion.premultiply(quaternion)
        _vrmGroup.updateMatrixWorld(true)
      }
      else {
        console.warn('No look-at target found in VRM model')
      }
      // Reset model rotation Y
      modelRotationY.value = 0

      // Set initial positions for animation
      function reAnchorRootPositionTrack(clip: AnimationClip) {
      // Get the hips node to re-anchor the root position track
        const hipNode = _vrm.humanoid?.getNormalizedBoneNode('hips')
        if (!hipNode) {
          console.warn('No hips node found in VRM model.')
          return
        }
        hipNode.updateMatrixWorld(true)
        const defaultHipPos = new Vector3()
        hipNode.getWorldPosition(defaultHipPos)

        // Calculate the offset from the hips node to the hips's first frame position
        const hipsTrack = clip.tracks.find(track =>
          track.name.endsWith('Hips.position'),
        )
        if (!(hipsTrack instanceof VectorKeyframeTrack)) {
          console.warn('No Hips.position track of type VectorKeyframeTrack found in animation.')
          return
        }

        const animeHipPos = new Vector3(
          hipsTrack.values[0],
          hipsTrack.values[1],
          hipsTrack.values[2],
        )
        const animeDelta = new Vector3().subVectors(animeHipPos, defaultHipPos)

        clip.tracks.forEach((track) => {
          if (track.name.endsWith('.position') && track instanceof VectorKeyframeTrack) {
            for (let i = 0; i < track.values.length; i += 3) {
              track.values[i] -= animeDelta.x
              track.values[i + 1] -= animeDelta.y
              track.values[i + 2] -= animeDelta.z
            }
          }
        })
      }

      const animation = await loadVRMAnimation(props.idleAnimation)
      const clip = await clipFromVRMAnimation(_vrm, animation)
      if (!clip) {
        console.warn('No VRM animation loaded')
        return
      }
      // Re-anchor the root position track to the model origin
      reAnchorRootPositionTrack(clip)

      // play animation
      vrmAnimationMixer.value = new AnimationMixer(_vrm.scene)
      vrmAnimationMixer.value.clipAction(clip).play()

      vrmEmote.value = useVRMEmote(_vrm)

      // TODO: perhaps we should allow user to choose whether to enable
      //       this kind of behavior or not?
      // WORKAROUND: set to use envMapIntensity for all matched materials
      // REVIEW: MeshToonMaterial, and MeshBasicMaterial will not be affected
      //         since they do not have envMapIntensity property
      _vrm.scene.traverse((child) => {
        if (child instanceof Mesh && child.material) {
          const material = Array.isArray(child.material) ? child.material : [child.material]
          material.forEach((mat) => {
            // console.debug('material: ', mat)
            if (mat instanceof MeshStandardMaterial || mat instanceof MeshPhysicalMaterial) {
              // Should read envMap intensity from outside props
              mat.envMapIntensity = 1.0
              mat.needsUpdate = true
            }
          })
        }
      })

      vrm.value = _vrm

      emit('modelReady')
      modelLoaded.value = true

      function getEyePosition(): number | null {
        const eye = vrm.value?.humanoid?.getNormalizedBoneNode('head')
        if (!eye)
          return null
        const eyePos = new Vector3()
        eye.getWorldPosition(eyePos)
        return eyePos.y
      }
      eyeHeight.value = getEyePosition()
      trackingMode.value = 'none'
      lookAtTarget.value = {
        x: 0,
        y: eyeHeight.value,
        z: -1000,
      }

      disposeBeforeRenderLoop = onBeforeRender(({ delta }) => {
        vrmAnimationMixer.value?.update(delta)
        vrm.value?.update(delta)
        vrm.value?.lookAt?.update?.(delta)
        blink.update(vrm.value, delta)
        idleEyeSaccades.update(vrm.value, lookAtTarget, delta)
        vrmEmote.value?.update(delta)
      }).off
    }
    catch (err) {
    // This is needed otherwise the URL input will be locked forever...
      emit('error', err)
    }
  }
  catch (err) {
    console.error(err)
  }
  finally {
    modelLoading.value = false
  }
}

watch(modelOffset, () => {
  if (vrmGroup.value) {
    vrmGroup.value.position.set(
      modelOffset.value.x,
      modelOffset.value.y,
      modelOffset.value.z,
    )
  }
}, { deep: true })

watch(modelRotationY, (newRotationY) => {
  if (vrm.value && vrmGroup.value) {
    vrmGroup.value.rotation.y = MathUtils.degToRad(newRotationY)
  }
})

// watch if the model needs to be reloaded
watch(modelSrcRef, (newSrc, oldSrc) => {
  if (newSrc !== oldSrc) {
    loadModel()
  }
})

const { pause, resume } = useLoop()

watch(() => props.paused, value => value ? pause() : resume())

function componentCleanUp() {
  disposeBeforeRenderLoop?.()
  if (vrm.value) {
    vrm.value.scene.removeFromParent()
    VRMUtils.deepDispose(vrm.value.scene)
  }
}

onMounted(async () => await loadModel())
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
  scene: computed(() => vrm.value?.scene),
  lookAtUpdate(target: { x: number, y: number, z: number }) {
    idleEyeSaccades.instantUpdate(vrm.value, target)
  },
})
</script>

<template>
  <slot v-if="modelLoaded" />
</template>
