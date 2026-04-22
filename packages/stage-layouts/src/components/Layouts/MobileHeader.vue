<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'

import HeaderAvatar from './HeaderAvatar.vue'
import MobileHeaderLink from './MobileHeaderLink.vue'

const route = useRoute()
</script>

<template>
  <header mb-1 w-full flex items-center justify-between gap-2 px-2>
    <MobileHeaderLink />
    <div :class="['flex items-center gap-2']">
      <RouterLink
        to="/lesson"
        :class="[
          'flex items-center justify-center rounded-full border-2 border-solid p-2 outline-none transition-all duration-200 ease-in-out',
          route.path.startsWith('/lesson')
            ? 'border-primary-300/60 bg-primary-300/20 text-primary-900 dark:border-primary-500/50 dark:bg-primary-500/20 dark:text-primary-50'
            : 'border-neutral-200/60 bg-white/60 text-neutral-600 dark:border-neutral-800/70 dark:bg-neutral-900/70 dark:text-neutral-200',
        ]"
      >
        <div class="i-solar:book-bookmark-bold-duotone h-5 w-5" />
      </RouterLink>
      <HeaderAvatar />
    </div>
  </header>
</template>
