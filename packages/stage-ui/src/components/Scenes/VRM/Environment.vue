<script setup lang="ts">
import type { CanvasTexture, DataTexture } from 'three'

import { useTresContext } from '@tresjs/core'
import { EquirectangularReflectionMapping } from 'three'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { onMounted, ref } from 'vue'

import defaultSkyBoxHdri from '../Tres/assets/sky_linekotsi_23_HDRI.hdr?url'

// Add these reactive variables to your setup
const environment = ref<DataTexture | CanvasTexture>()
const backgroundBlur = ref(0) // Controls background blur
const backgroundIntensity = ref(1) // Controls background visibility

const { scene } = useTresContext()

// Add this function to load HDRI environment
async function loadEnvironment() {
  try {
    const loader = new RGBELoader()
    // Resources
    // - polyhaven.com
    // - hdrihaven.com
    const texture = await loader.loadAsync(defaultSkyBoxHdri)
    texture.mapping = EquirectangularReflectionMapping

    environment.value = texture

    // Apply to scene if renderer is available
    if (scene.value) {
      scene.value.environment = texture
      scene.value.background = texture
      scene.value.backgroundBlurriness = backgroundBlur.value
      scene.value.backgroundIntensity = backgroundIntensity.value
    }
  }
  catch (error) {
    console.warn('Failed to load HDRI environment:', error)
  }
}

// Usage in your component
onMounted(async () => {
  await loadEnvironment()
})
</script>

<template>
  <slot />
</template>
