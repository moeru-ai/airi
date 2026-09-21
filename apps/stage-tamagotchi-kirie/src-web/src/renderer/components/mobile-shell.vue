<script setup lang="ts">
import { ErrorBoundary } from '@proj-airi/ui'
import { useRoute } from 'vue-router'

import StagePage from '../pages/index.vue'

defineProps<{
  enabled: boolean
}>()

const route = useRoute()
</script>

<template>
  <div :class="['h-full w-full', enabled ? 'bg-neutral-100 dark:bg-neutral-900' : '']">
    <!-- The stage owns voice input and avatar output. Keep it alive behind mobile routes. -->
    <div
      v-if="enabled"
      :inert="route.path !== '/'"
      :class="['h-full w-full', route.path !== '/' ? 'pointer-events-none invisible absolute inset-0' : '']"
    >
      <ErrorBoundary>
        <StagePage />
      </ErrorBoundary>
    </div>
    <slot v-if="!enabled || route.path !== '/'" />
  </div>
</template>
