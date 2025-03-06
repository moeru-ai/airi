<script setup lang="ts">
import { RouterLink } from 'vue-router'

// Define route configurations
const routes = [
  { number: 1, path: '/' },
  { number: 2, path: '/transition-2' },
  { number: 3, path: '/transition-3' },
  { number: 4, path: '/transition-4' },
  { number: 5, path: '/transition-5' },
  { number: 6, path: '/transition-6' },
  { number: 7, path: '/transition-7' },
]
</script>

<template>
  <div flex="~ row gap-2" h-full items-center justify-center>
    <RouterLink
      v-for="route in routes" :key="route.number" :to="route.path" rounded-lg px-7 py-3
      transition="all duration-250 ease-in-out"
      class="bg-neutral-100 [&.router-link-active]:bg-neutral-300 dark:bg-neutral-700 hover:bg-neutral-200 [&.router-link-active]:dark:bg-neutral-600 [&.router-link-active]:hover:bg-neutral-400 hover:dark:bg-neutral-600 [&.router-link-active]:hover:dark:bg-neutral-500"
    >
      {{ route.number }}
    </RouterLink>
  </div>
</template>
