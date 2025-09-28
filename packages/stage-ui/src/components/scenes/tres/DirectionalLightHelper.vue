<script setup lang="ts">
import { useTresContext } from '@tresjs/core'
import { until } from '@vueuse/core'
import { onMounted, shallowRef, toRef } from 'vue'

import * as THREE from 'three'

const props = defineProps<{
  directionalLight?: THREE.DirectionalLight | null
}>()

const { scene } = useTresContext()
const directionalLightRef = toRef(() => props.directionalLight)
const lightHelper = shallowRef<THREE.DirectionalLightHelper>()

onMounted(async () => {
  await until(directionalLightRef).toBeTruthy()
  lightHelper.value = new THREE.DirectionalLightHelper(directionalLightRef.value!, 1)
  scene.value.add(lightHelper.value)
})

if (import.meta.hot) {
  // Ensure cleanup on HMR
  import.meta.hot.dispose(() => {
    try {
      if (lightHelper.value) {
        lightHelper.value.dispose()
        scene.value.remove(lightHelper.value)
        lightHelper.value = undefined
      }
    }
    catch (error) {
      console.error('Error during DirectionalLightHelper cleanup:', error)
    }
  })
}
</script>

<template>
  <slot />
</template>
