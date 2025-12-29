<script setup lang="ts">
import { RouterView } from 'vue-router'
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
    <!-- Content -->
    <div class="px-3 py-2 md:px-5 md:py-5" flex="~ col" h-full>
      <RouterView />
    </div>
  </div>
</template>
