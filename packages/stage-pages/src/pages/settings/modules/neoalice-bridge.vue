<script setup lang="ts">
import { NeoAliceBridge } from '@proj-airi/stage-ui/components'
</script>

<template>
  <NeoAliceBridge />
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.neoalice-bridge.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
