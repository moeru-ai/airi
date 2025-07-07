<script setup lang="ts">
import ToasterPWAUpdateReady from './ToasterPWAUpdateReady.vue'
</script>

<template>
  <Story
    title="Toaster PWA Update Ready"
    group="widgets"
    :layout="{ type: 'grid', width: '100%' }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant
      id="default"
      title="Default"
    >
      <ToasterPWAUpdateReady />
    </Variant>
  </Story>
</template>
