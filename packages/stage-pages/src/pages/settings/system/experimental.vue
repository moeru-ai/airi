<script setup lang="ts">
import SettingsExperimentalFeatures from '../../../components/settings-experimental-features.vue'
</script>

<template>
  <SettingsExperimentalFeatures />
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.system.experimental.title
  subtitleKey: settings.title
  icon: i-solar:test-tube-bold-duotone
  stageTransition:
    name: slide
</route>
