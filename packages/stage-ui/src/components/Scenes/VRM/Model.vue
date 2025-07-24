<script setup lang="ts">
import type { VRMCore } from '@pixiv/three-vrm-core'
import type { AnimationClip, Group } from 'three'

import { VRMUtils } from '@pixiv/three-vrm'
import { useLoop, useTresContext } from '@tresjs/core'
import { storeToRefs } from 'pinia'
import { AnimationMixer, MathUtils, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack } from 'three'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import { clipFromVRMAnimation, loadVRMAnimation, useBlink, useIdleEyeSaccades } from '../../../composables/vrm/animation'
import { loadVrm } from '../../../composables/vrm/core'
import { useVRMEmote } from '../../../composables/vrm/expression'
import { useVRM } from '../../../stores'

const props = defineProps<{
  model: string
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
  loadingModel,
  modelRotationY,
} = storeToRefs(vrmStore)
const vrmGroup = ref<Group>()
const idleEyeSaccades = useIdleEyeSaccades()

onMounted(async () => {
  if (!scene.value) {
    console.warn('Scene is not ready, cannot load VRM model.')
    return
  }

  try {
    const _vrmInfo = await loadVrm(props.model, {
      scene: scene.value,
      lookAt: true,
      positionOffset: [modelOffset.value.x, modelOffset.value.y, modelOffset.value.z],
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
    function reanchorRootPositionTrack(clip: AnimationClip) {
      // Get the hips node to reanchor the root position track
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

    // Model rotationed, so the animation also needs rotation
    function rotateRotationTracksInClip(clip: AnimationClip, q: Quaternion) {
      clip.tracks.forEach((track) => {
        if (track instanceof QuaternionKeyframeTrack) {
          for (let i = 0; i < track.values.length; i += 4) {
            const original = new Quaternion(
              track.values[i],
              track.values[i + 1],
              track.values[i + 2],
              track.values[i + 3],
            )
            const rotated = q.clone().multiply(original).normalize()
            track.values[i] = rotated.x
            track.values[i + 1] = rotated.y
            track.values[i + 2] = rotated.z
            track.values[i + 3] = rotated.w
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
    // Reanchor the root position track to the model origin
    reanchorRootPositionTrack(clip)
    rotateRotationTracksInClip(clip, quaternion)

    // play animation
    vrmAnimationMixer.value = new AnimationMixer(_vrm.scene)
    vrmAnimationMixer.value.clipAction(clip).play()

    vrmEmote.value = useVRMEmote(_vrm)

    vrm.value = _vrm

    loadingModel.value = false
    emit('modelReady')

    disposeBeforeRenderLoop = onBeforeRender(({ delta }) => {
      vrmAnimationMixer.value?.update(delta)
      vrm.value?.update(delta)
      vrm.value?.lookAt?.update?.(delta)
      blink.update(vrm.value, delta)
      idleEyeSaccades.update(vrm.value, cameraPosition, delta)
      vrmEmote.value?.update(delta)
    }).off
  }
  catch (err) {
    // This is needed otherwise the URL input will be locked forever...
    loadingModel.value = false
    emit('error', err)
  }
})

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

defineExpose({
  setExpression(expression: string) {
    vrmEmote.value?.setEmotionWithResetAfter(expression, 1000)
  },
  scene: computed(() => vrm.value?.scene),
  lookAtUpdate(target: { x: number, y: number, z: number }) {
    idleEyeSaccades.instantUpdate(vrm.value, target)
  },
})

const { pause, resume } = useLoop()

watch(() => props.paused, (value) => {
  value ? pause() : resume()
})

onUnmounted(() => {
  disposeBeforeRenderLoop?.()
  if (vrm.value) {
    vrm.value.scene.removeFromParent()
    VRMUtils.deepDispose(vrm.value.scene)
  }
})
</script>

<template>
  <slot />
</template>
