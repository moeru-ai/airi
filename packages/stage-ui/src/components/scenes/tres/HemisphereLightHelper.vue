<script setup lang="ts">
import { useTresContext } from '@tresjs/core'
import { until } from '@vueuse/core'
import { onMounted, shallowRef, toRef } from 'vue'

import * as THREE from 'three'

const props = defineProps<{
  hemisphereLight?: THREE.HemisphereLight | null
}>()

const { scene } = useTresContext()
const hemisphereLightRef = toRef(() => props.hemisphereLight)
const lightHelper = shallowRef<THREE.HemisphereLightHelper>()

onMounted(async () => {
  await until(hemisphereLightRef).toBeTruthy()
  lightHelper.value = new THREE.HemisphereLightHelper(hemisphereLightRef.value!, 1)
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
      console.error('Error during HemisphereLightHelper cleanup:', error)
    }
  })
}
</script>

<template>
  <slot />
</template>
