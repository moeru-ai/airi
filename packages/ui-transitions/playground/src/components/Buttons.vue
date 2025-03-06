<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <div flex="~ row gap-2" h-full items-center justify-center>
    <RouterLink
      rounded-lg px-7 py-3 transition="all duration-250 ease-in-out" to="/"
      :class="[route.path === '/' ? 'bg-neutral-200 dark:bg-neutral-500' : 'bg-neutral-100 dark:bg-neutral-700']"
    >
      1
    </RouterLink>
    <RouterLink
      rounded-lg px-7 py-3 transition="all duration-250 ease-in-out" to="/transition-2"
      :class="[route.path === '/transition-2' ? 'bg-neutral-200 dark:bg-neutral-500' : 'bg-neutral-100 dark:bg-neutral-700']"
    >
      2
    </RouterLink>
    <RouterLink
      rounded-lg px-7 py-3 transition="all duration-250 ease-in-out" to="/transition-3"
      :class="[route.path === '/transition-3' ? 'bg-neutral-200 dark:bg-neutral-500' : 'bg-neutral-100 dark:bg-neutral-700']"
    >
      3
    </RouterLink>
    <RouterLink
      rounded-lg px-7 py-3 transition="all duration-250 ease-in-out" to="/transition-4"
      :class="[route.path === '/transition-4' ? 'bg-neutral-200 dark:bg-neutral-500' : 'bg-neutral-100 dark:bg-neutral-700']"
    >
      4
    </RouterLink>
    <RouterLink
      rounded-lg px-7 py-3 transition="all duration-250 ease-in-out" to="/transition-5"
      :class="[route.path === '/transition-5' ? 'bg-neutral-200 dark:bg-neutral-500' : 'bg-neutral-100 dark:bg-neutral-700']"
    >
      5
    </RouterLink>
    <RouterLink
      rounded-lg px-7 py-3 transition="all duration-250 ease-in-out" to="/transition-6"
      :class="[route.path === '/transition-6' ? 'bg-neutral-200 dark:bg-neutral-500' : 'bg-neutral-100 dark:bg-neutral-700']"
    >
      6
    </RouterLink>
  </div>
</template>
