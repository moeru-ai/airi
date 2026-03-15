<script setup lang="ts">
import { X } from '@proj-airi/stage-ui/components'
</script>

<template>
  <X />
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.x.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
