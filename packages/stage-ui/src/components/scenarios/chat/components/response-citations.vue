<script setup lang="ts">
import type { Citation } from '@proj-airi/core-agent'

import { computed } from 'vue'

const props = defineProps<{ citations: Citation[] }>()
// Imported chat history is untrusted. Only web URLs can become clickable sources.
const sources = computed(() => props.citations.filter(source => /^https?:\/\//i.test(source.url)))
</script>

<template>
  <div v-if="sources.length" :class="['flex flex-wrap gap-x-3 gap-y-1', 'text-xs']">
    <a
      v-for="(source, index) in sources"
      :key="`${source.url}-${index}`"
      :href="source.url"
      target="_blank"
      rel="noopener noreferrer"
      :class="['underline underline-offset-2', 'text-primary-600 dark:text-primary-300']"
    >[{{ index + 1 }}] {{ source.title }}</a>
  </div>
</template>
