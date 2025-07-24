<script setup lang="ts">
import { RouterView } from 'vue-router'

import HeaderLink from '../components/Layouts/HeaderLink.vue'
</script>

<template>
  <div
    :style="{
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      paddingTop: 'env(safe-area-inset-top, 0px)',
      paddingRight: 'env(safe-area-inset-right, 0px)',
      paddingLeft: 'env(safe-area-inset-left, 0px)',
    }"
    h-full
  >
    <!-- Header -->
    <div
      class="px-0 py-1 md:px-3 md:py-3"
      w-full gap-2
      bg="$bg-color"
    >
      <HeaderLink />
    </div>
    <!-- Content -->
    <div class="px-3 py-2 md:px-5 md:py-5" flex="~ col" h="[calc(100%-56px)]">
      <RouterView />
    </div>
  </div>
</template>
