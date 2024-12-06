<script setup lang="ts">
import type { VRMCore } from '@pixiv/three-vrm-core'
import { useLoop, useTresContext } from '@tresjs/core'
import { AnimationMixer } from 'three'
import { clipFromVRMAnimation, loadVRMAnimation } from '~/composables/vrm/animation'
import { loadVrm } from '~/composables/vrm/core'

const props = defineProps<{
  model: string
  idleAnimation: string
  loadAnimations?: string[]
  position: [number, number, number]
}>()

const emit = defineEmits<{
  (e: 'loadModelProgress', value: number): void
  (e: 'error', value: unknown): void
}>()

const vrm = ref<VRMCore>()
const vrmAnimationMixer = ref<AnimationMixer>()
const { scene } = useTresContext()
const { onBeforeRender } = useLoop()

watch(() => props.position, ([x, y, z]) => {
  if (vrm.value) {
    vrm.value.scene.position.set(x, y, z)
  }
})

onMounted(async () => {
  if (!scene.value) {
    return
  }

  try {
    const _vrm = await loadVrm(props.model, {
      scene: scene.value,
      lookAt: true,
      position: props.position,
      onProgress: progress => emit('loadModelProgress', Number.parseFloat((100.0 * (progress.loaded / progress.total)).toFixed(2))),
    })
    if (!_vrm) {
      console.warn('No VRM model loaded')
      return
    }

    const animation = await loadVRMAnimation(props.idleAnimation)
    const clip = await clipFromVRMAnimation(_vrm, animation)
    if (!clip) {
      console.warn('No VRM animation loaded')
      return
    }

    // play animation
    vrmAnimationMixer.value = new AnimationMixer(_vrm.scene)
    vrmAnimationMixer.value.clipAction(clip).play()

    onBeforeRender(({ delta }) => {
      vrmAnimationMixer.value?.update(delta)
      vrm.value?.update(delta)
    })

    vrm.value = _vrm
  }
  catch (err) {
    emit('error', err)
  }
})

onUnmounted(() => {
  if (vrm.value) {
    const { scene } = useTresContext()
    scene.value.remove(vrm.value.scene)
  }
})
</script>

<template>
  <slot />
</template>
