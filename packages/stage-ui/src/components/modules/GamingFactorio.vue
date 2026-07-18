<script setup lang="ts">
import GamingModuleSettings from './GamingModuleSettings.vue'

import { useFactorioStore } from '../../stores/modules/gaming-factorio'

const factorioStore = useFactorioStore()
</script>

<template>
  <GamingModuleSettings
    :store="factorioStore"
    i18n-key-prefix="settings.pages.modules.gaming-factorio"
  />
</template>
