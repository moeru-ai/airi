<script setup lang="ts">
import type { VRMCore } from '@pixiv/three-vrm'
import { VRMLoaderPlugin } from '@pixiv/three-vrm'
import { useTresContext } from '@tresjs/core'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const props = defineProps<{
  model: string
  position: [number, number, number]
}>()

const emit = defineEmits<{
  (e: 'loadModelProgress', value: number): void
  (e: 'error', value: unknown): void
}>()

let vrm: VRMCore
const { scene } = useTresContext()

interface GLTFUserdata extends Record<string, any> {
  vrm: VRMCore
}

onMounted(() => {
  if (!scene.value) {
    return
  }

  const loader = new GLTFLoader()
  loader.register(parser => new VRMLoaderPlugin(parser))
  loader.load(
    props.model,
    (gltf) => {
      const userData = gltf.userData as GLTFUserdata
      vrm = userData.vrm as VRMCore
      scene.value.add(vrm.scene)
      vrm.scene.position.set(...props.position)
    },
    progress => emit('loadModelProgress', Number.parseFloat((100.0 * (progress.loaded / progress.total)).toFixed(2))),
    error => emit('error', error),
  )
})

onUnmounted(() => {
  if (vrm) {
    const { scene } = useTresContext()
    scene.value.remove(vrm.scene)
  }
})

watch(() => props.position, ([x, y, z]) => {
  if (vrm) {
    vrm.scene.position.set(x, y, z)
  }
})
</script>

<template>
  <slot />
</template>
