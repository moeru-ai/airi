<script lang="ts" setup>
import { ScrollableArea } from '@proj-airi/ui'
</script>

<template>
  <ScrollableArea
    :class="[
      'bg-neutral-100 dark:bg-neutral-800',
    ]"
  >
    <slot />
  </ScrollableArea>
</template>
