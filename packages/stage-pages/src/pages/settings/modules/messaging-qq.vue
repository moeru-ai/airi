<script setup lang="ts">
import { MessagingQQ } from '@proj-airi/stage-ui/components'
</script>

<template>
  <MessagingQQ />
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.messaging-qq.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
