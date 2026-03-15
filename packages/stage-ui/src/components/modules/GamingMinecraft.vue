<script setup lang="ts">
import GamingModuleSettings from './GamingModuleSettings.vue'

import { useMinecraftStore } from '../../stores/modules/gaming-minecraft'

const minecraftStore = useMinecraftStore()
</script>

<template>
  <GamingModuleSettings
    :store="minecraftStore"
    i18n-key-prefix="settings.pages.modules.gaming-minecraft"
  />
</template>
