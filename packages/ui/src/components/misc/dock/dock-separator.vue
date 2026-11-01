<script setup lang="ts">
import { computed } from 'vue'

import { injectDockContext } from './context'

const dock = injectDockContext(null)
const vertical = computed(() => dock?.orientation.value === 'vertical')
const blurry = computed(() => dock?.variant.value === 'blurry')
</script>

<template>
  <!-- A line between groups of buttons of a `Dock`. It runs across the dock. -->
  <div
    role="separator"
    :aria-orientation="vertical ? 'horizontal' : 'vertical'"
    :class="[
      vertical ? 'my-1.5 h-px w-4' : 'mx-1.5 h-4 w-px',
      'shrink-0',
      blurry ? 'bg-neutral-900/10 dark:bg-white/10' : 'bg-neutral-200 dark:bg-neutral-700',
    ]"
  />
</template>
