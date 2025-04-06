<script setup lang="ts">
import { RouterLink } from 'vue-router'

import HeaderLink from './HeaderLink.vue'
</script>

<template>
  <header mb-1 w-full gap-2>
    <div w-full>
      <HeaderLink />
    </div>
    <RouterLink
      class="m-1 block max-h-[10lh] min-h-[1lh] rounded-lg bg-neutral-100 p-2 text-lg text-neutral-500 outline-none dark:bg-neutral-800 dark:text-neutral-400"
      to="/settings"
    >
      <div i-solar:settings-minimalistic-bold-duotone />
    </RouterLink>
  </header>
</template>
