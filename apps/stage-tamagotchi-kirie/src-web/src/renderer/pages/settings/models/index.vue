<script setup lang="ts">
import MobileModelSettings from '@proj-airi/stage-pages/pages/settings/models/index.vue'

import DesktopModelSettings from './components/model-settings-desktop.vue'

import { isAndroidRenderer } from '../../../window-context'
</script>

<template>
  <MobileModelSettings v-if="isAndroidRenderer()" />
  <DesktopModelSettings v-else />
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.models.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.models.description
  icon: i-solar:people-nearby-bold-duotone
  settingsEntry: true
  order: 4
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
