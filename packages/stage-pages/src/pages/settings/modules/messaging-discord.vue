<script setup lang="ts">
import { MessagingDiscord } from '@proj-airi/stage-ui/components'
</script>

<template>
  <MessagingDiscord />
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.messaging-discord.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
