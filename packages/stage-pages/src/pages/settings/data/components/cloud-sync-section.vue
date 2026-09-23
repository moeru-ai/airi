<script setup lang="ts">
import { CloudSyncFields } from '@proj-airi/stage-ui/components'
</script>

<template>
  <div
    :class="[
      'border-2 border-neutral-200/50 rounded-xl bg-white/70 p-4 shadow-sm',
      'dark:border-neutral-800/60 dark:bg-neutral-900/60',
    ]"
  >
    <CloudSyncFields />
  </div>
</template>
