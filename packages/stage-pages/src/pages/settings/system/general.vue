<script setup lang="ts">
import SettingsGeneralFields from '../../../components/settings-general-fields.vue'
</script>

<template>
  <SettingsGeneralFields />
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.system.general.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
