<script setup lang="ts">
import { BilingualSubtitlesSettings } from '@proj-airi/stage-ui/components'
</script>

<template>
  <BilingualSubtitlesSettings />
</template>

<route lang="yaml">
meta:
  layout: settings
  settingsEntry: true
  icon: i-solar:translate-line-duotone
  titleKey: settings.pages.bilingual.title
  descriptionKey: settings.pages.bilingual.description
  order: 10
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
