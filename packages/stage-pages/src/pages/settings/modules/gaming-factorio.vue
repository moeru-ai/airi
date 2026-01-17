<script setup lang="ts">
import { GamingFactorio } from '@proj-airi/stage-ui/components'
</script>

<template>
  <GamingFactorio />
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.gaming-factorio.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
