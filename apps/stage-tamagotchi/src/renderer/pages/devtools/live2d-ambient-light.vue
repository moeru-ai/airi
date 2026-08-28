<script setup lang="ts">
import Live2DAmbientLightControls from '../../components/Devtools/live2d-ambient-light/controls.vue'
import Live2DAmbientLightSampling from '../../components/Devtools/live2d-ambient-light/sampling.vue'
import Live2DAmbientLightShader from '../../components/Devtools/live2d-ambient-light/shader.vue'
</script>

<template>
  <div :class="['grid gap-4 pb-12']">
    <Live2DAmbientLightControls />
    <Live2DAmbientLightSampling />
    <Live2DAmbientLightShader />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: tamagotchi.settings.devtools.pages.live2d-ambient-light.title
  subtitleKey: tamagotchi.settings.devtools.title
</route>
