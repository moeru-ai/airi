<script setup lang="ts">
import MobileMcpSettings from '@proj-airi/stage-pages/pages/settings/modules/mcp.vue'

import DesktopMcpSettings from './components/mcp-desktop.vue'

import { isAndroidRenderer } from '../../../window-context'
</script>

<template>
  <MobileMcpSettings v-if="isAndroidRenderer()" />
  <DesktopMcpSettings v-else />
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.mcp-server.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
