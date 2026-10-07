<script setup lang="ts">
import MobileDeveloperSettings from '@proj-airi/stage-pages/components/settings-developer-mobile.vue'

import DesktopDeveloperSettings from './components/developer-desktop.vue'

import { isAndroidRenderer } from '../../../window-context'
</script>

<template>
  <MobileDeveloperSettings v-if="isAndroidRenderer()" />
  <DesktopDeveloperSettings v-else />
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.system.developer.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
