<script setup lang="ts">
import { ScrollableArea } from '@proj-airi/ui'

defineProps<{
  settingsClass?: string | string[]
}>()
</script>

<template>
  <ScrollableArea
    :class="[
      'z-10',
      settingsClass,
    ]"
  >
    <slot />
  </ScrollableArea>
</template>
