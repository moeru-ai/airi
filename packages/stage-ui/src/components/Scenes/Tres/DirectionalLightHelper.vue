<script setup lang="ts">
import { useTresContext } from '@tresjs/core'
import { until } from '@vueuse/core'
import { onMounted, toRef } from 'vue'

import * as THREE from 'three'

const props = defineProps<{
  directionalLight?: THREE.DirectionalLight | null
}>()

const { scene } = useTresContext()
const directionalLightRef = toRef(() => props.directionalLight)

onMounted(async () => {
  await until(directionalLightRef).toBeTruthy()
  scene.value.add(new THREE.DirectionalLightHelper(props.directionalLight!, 1))
})
</script>

<template>
  <slot />
</template>
