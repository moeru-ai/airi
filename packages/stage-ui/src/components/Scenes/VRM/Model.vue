<script setup lang="ts">
import type { VRMCore } from '@pixiv/three-vrm-core'
import type { AnimationClip, Group } from 'three'

import { VRMUtils } from '@pixiv/three-vrm'
import { useLoop, useTresContext } from '@tresjs/core'
import { storeToRefs } from 'pinia'
import { AnimationMixer, MathUtils, Quaternion, Vector3 } from 'three'
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
}>()

let disposeBeforeRenderLoop: (() => void | undefined)

const vrm = ref<VRMCore>()
const vrmAnimationMixer = ref<AnimationMixer>()
const { scene } = useTresContext()
const { onBeforeRender } = useLoop()
const blink = useBlink()
const idleEyeSaccades = useIdleEyeSaccades()
const vrmEmote = ref<ReturnType<typeof useVRMEmote>>()

const vrmStore = useVRM()
const {
  modelOffset,
  modelOrigin,
  modelSize,
  position,
  initialCameraPosition,
  loadingModel,
  modelRotationY,
} = storeToRefs(vrmStore)
const vrmGroup = ref<Group>()

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
      initialCameraPosition: vrmInitialCameraPosition,
    } = _vrmInfo

    vrmGroup.value = _vrmGroup
    // Set initial camera position
    initialCameraPosition.value = vrmInitialCameraPosition

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
    const lookAtTarget = _vrm.lookAt
    if (lookAtTarget) {
      const facingDirection = lookAtTarget.faceFront
      const quaternion = new Quaternion()
      quaternion.setFromUnitVectors(facingDirection.normalize(), targetDirection.normalize())
      _vrm.scene.quaternion.premultiply(quaternion)
      _vrm.scene.updateMatrixWorld(true)
    }
    else {
      console.warn('No look-at target found in VRM model')
    }
    // Reset model rotation Y
    modelRotationY.value = 0

    // Set initial positions for animation
    function removeRootPositionTrack(clip: AnimationClip) {
      clip.tracks = clip.tracks.filter((track) => {
        return !track.name.endsWith('.position')
      })
    }

    const animation = await loadVRMAnimation(props.idleAnimation)
    const clip = await clipFromVRMAnimation(_vrm, animation)
    if (!clip) {
      console.warn('No VRM animation loaded')
      return
    }

    removeRootPositionTrack(clip)

    // play animation
    vrmAnimationMixer.value = new AnimationMixer(_vrm.scene)
    vrmAnimationMixer.value.clipAction(clip).play()

    vrmEmote.value = useVRMEmote(_vrm)

    vrm.value = _vrm

    loadingModel.value = false

    disposeBeforeRenderLoop = onBeforeRender(({ delta }) => {
      vrmAnimationMixer.value?.update(delta)
      vrm.value?.update(delta)
      blink.update(vrm.value, delta)
      idleEyeSaccades.update(vrm.value, delta)
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
      position.value.x,
      position.value.y,
      position.value.z,
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
