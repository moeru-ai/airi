<script setup lang="ts">
import { useMemoryStore } from '@proj-airi/stage-ui/stores/memory'
import { onMounted } from 'vue'

import LongTermSection from './components/LongTermSection.vue'
import ShortTermSection from './components/ShortTermSection.vue'

const memoryStore = useMemoryStore()

onMounted(() => {
  // Ensure we load the latest configuration when entering the page
  memoryStore.loadConfiguration()
})
</script>

<template>
  <div class="grid gap-6 xl:grid-cols-2">
    <ShortTermSection />
    <LongTermSection />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
