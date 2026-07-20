<script setup lang="ts">
import { WebSearch } from '@proj-airi/stage-ui/components'
</script>

<template>
  <WebSearch />
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.web-search.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
