<script setup lang="ts">
import PresenceBubbleControls from '../../components/devtools/presence-bubble/controls.vue'
</script>

<template>
  <div :class="['grid gap-4 pb-12']">
    <PresenceBubbleControls />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
</route>
