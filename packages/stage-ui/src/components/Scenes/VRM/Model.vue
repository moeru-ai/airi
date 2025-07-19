<script setup lang="ts">
import type { VRMCore } from '@pixiv/three-vrm-core'

import type { useVRMEmote } from '../../../composables/vrm/expression'

import { VRMUtils } from '@pixiv/three-vrm'
import { useVRM } from '@proj-airi/stage-ui/stores'
import { useLoop, useTresContext } from '@tresjs/core'
import { storeToRefs } from 'pinia'
import { onMounted, onUnmounted, ref, watch } from 'vue'

import { loadVrm } from '../../../composables/vrm/core'

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
// const vrmAnimationMixer = ref<AnimationMixer>()
const { scene } = useTresContext()
const { onBeforeRender } = useLoop()
// const blink = useBlink()
// const idleEyeSaccades = useIdleEyeSaccades()
const vrmEmote = ref<ReturnType<typeof useVRMEmote>>()

const vrmStore = useVRM()
const {
  modelOffset,
  modelOrigin,
  modelSize,
  // modelPosition
} = storeToRefs(vrmStore)

// watch(modelOffset, () => {
//   if (vrm.value) {
//     vrm.value.scene.position.set(
//       modelPosition.value.x,
//       modelPosition.value.y,
//       modelPosition.value.z
//     )
//   }
// })

onMounted(async () => {
  if (!scene.value) {
    return
  }

  try {
    const _vrmInfo = await loadVrm(props.model, {
      scene: scene.value,
      lookAt: true,
      positionOffset: [modelOffset.value.x, modelOffset.value.y, modelOffset.value.z],
      onProgress: progress => emit('loadModelProgress', Number.parseFloat((100.0 * (progress.loaded / progress.total)).toFixed(2))),
    })
    if (!_vrmInfo) {
      console.warn('No VRM model loaded')
      return
    }
    const { _vrm, modelCenter: vrmModelCenter, modelSize: vrmModelSize } = _vrmInfo
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

    // const animation = await loadVRMAnimation(props.idleAnimation)
    // const clip = await clipFromVRMAnimation(_vrm, animation)
    // if (!clip) {
    //   console.warn('No VRM animation loaded')
    //   return
    // }

    // // play animation
    // vrmAnimationMixer.value = new AnimationMixer(_vrm.scene)
    // vrmAnimationMixer.value.clipAction(clip).play()

    // vrmEmote.value = useVRMEmote(_vrm)

    vrm.value = _vrm

    disposeBeforeRenderLoop = onBeforeRender(({ delta }) => {
      // vrmAnimationMixer.value?.update(delta)
      vrm.value?.update(delta)
      // blink.update(vrm.value, delta)
      // idleEyeSaccades.update(vrm.value, delta)
      // vrmEmote.value?.update(delta)
    }).off
  }
  catch (err) {
    emit('error', err)
  }
})

onUnmounted(() => {
  disposeBeforeRenderLoop?.()
  if (vrm.value) {
    vrm.value.scene.removeFromParent()
    VRMUtils.deepDispose(vrm.value.scene)
  }
})

defineExpose({
  setExpression(expression: string) {
    vrmEmote.value?.setEmotionWithResetAfter(expression, 1000)
  },
})

const { pause, resume } = useLoop()

watch(() => props.paused, (value) => {
  value ? pause() : resume()
})
</script>

<template>
  <slot />
</template>
