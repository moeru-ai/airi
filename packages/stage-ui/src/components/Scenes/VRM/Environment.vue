<script setup lang="ts">
import type { CanvasTexture, DataTexture, Scene, WebGLRenderer } from 'three'

import { useTresContext } from '@tresjs/core'
import {
  ACESFilmicToneMapping,
  PMREMGenerator,
  SRGBColorSpace,
} from 'three'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { onMounted, onUnmounted, ref, watch } from 'vue'

import defaultskyBoxSrc from '../Tres/assets/sky_linekotsi_23_HDRI.hdr?url'

/**
 * Props
 * - src: HDRI url; when falsy ('' | null | undefined) the environment is cleared but component stays mounted.
 * - asBackground: whether to also use as scene.background.
 * - backgroundBlurriness / backgroundIntensity: r152+ background controls.
 */
const props = withDefaults(defineProps<{
  skyBoxSrc?: string | null
  asBackground?: boolean
  backgroundBlurriness?: number
  backgroundIntensity?: number
}>(), {
  skyBoxSrc: defaultskyBoxSrc,
  asBackground: true,
  backgroundBlurriness: 0,
  backgroundIntensity: 1,
})

// Add these reactive variables to your setup
const environment = ref<DataTexture | CanvasTexture>()
let _pmrem: PMREMGenerator | null = null
let _envRT: any = null // WebGLRenderTarget from PMREM

const { scene, renderer } = useTresContext()

// Remove the sky box
async function clearEnvironment() {
  const scn = scene.value as Scene | null
  if (!scn)
    return
  scn.environment = null
  scn.background = null
  // Do not forcibly clear background; caller/prop controls that intent.
  // scn.background = null
  _envRT?.dispose?.()
  _pmrem?.dispose?.()
  _envRT = null
  _pmrem = null
}

// load HDRI environment from sky box
async function loadEnvironment(skyBoxSrc?: string | null) {
  if (!scene.value || !renderer.value)
    return

  // Always dispose previous env when switching
  clearEnvironment()

  // If no designated sky box, then load the default one
  if (!skyBoxSrc) {
    skyBoxSrc = defaultskyBoxSrc
  }

  // Recommended renderer configuration for HDR + PBR
  renderer.value.outputColorSpace = SRGBColorSpace
  // This tone mapping is only for BPR parts, for NPR parts, this mapping will be disabled when loading model (as per parts)
  renderer.value.toneMapping = ACESFilmicToneMapping

  try {
    // Resources
    // - polyhaven.com
    // - hdrihaven.com
    const hdrTex = await new RGBELoader().loadAsync(skyBoxSrc)

    // PMREM prefiltering for physically correct IBL
    _pmrem = new PMREMGenerator(renderer.value as WebGLRenderer)
    const rt = _pmrem.fromEquirectangular(hdrTex)
    _envRT = rt

    environment.value = hdrTex
    const scn = scene.value as Scene
    scn.environment = rt.texture // drives PBR materials (Standard/Physical)
    if (props.asBackground)
      scn.background = rt.texture // optional: also show as background
    // r152+: background controls (no-ops on older versions)
    scn.backgroundBlurriness = props.backgroundBlurriness
    scn.backgroundIntensity = props.backgroundIntensity

    // Source HDR no longer needed for sampling by materials
    hdrTex.dispose()
  }
  catch (error) {
    console.warn('Failed to load HDRI environment:', error)
  }
}

// Usage in your component
onMounted(async () => {
  // load environment from sky box (default or user input)
  await loadEnvironment(props.skyBoxSrc)

  // hot switch: react to sky box change
  watch(
    // Actually we can also let user set background blurriness or intensity
    // TODO: maybe we can open more options for users regarding to the settings of the background in the future
    () => [props.skyBoxSrc],
    ([skyBoxSrc]) => {
      loadEnvironment(skyBoxSrc as string | null)
    },
    { deep: false },
  )
})

onUnmounted(async () => {
  await clearEnvironment()
})
</script>

<template>
  <slot />
</template>
