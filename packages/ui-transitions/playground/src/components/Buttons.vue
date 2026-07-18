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
  <div h-full w-full flex items-center justify-center>
    <div class="grid grid-cols-3 gap-2 sm:(flex flex-row gap-2)" w="full sm:fit">
      <RouterLink
        v-for="route in routes" :key="route.number" :to="route.path"
        transition="all duration-250 ease-in-out" w="auto" aspect-ratio="square sm:unset"
        bg="neutral-100 [&.router-link-active]:neutral-300 dark:neutral-700 hover:neutral-200 [&.router-link-active]:dark:neutral-600 [&.router-link-active]:hover:neutral-400 hover:dark:neutral-600 [&.router-link-active]:hover:dark:neutral-500"
        flex items-center justify-center rounded-lg px-7 py-3
      >
        <span>{{ route.number }}</span>
      </RouterLink>
    </div>
  </div>
</template>
