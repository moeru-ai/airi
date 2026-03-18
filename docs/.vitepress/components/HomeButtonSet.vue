<script setup lang="ts">
import type { ButtonItem } from '../theme/config.ts'

import HomeButton from './HomeButton.vue'

defineProps<{
  items: ButtonItem[]
}>()
</script>

<template>
  <div class="relative z-10 w-full flex justify-center gap-4">
    <HomeButton v-for="b of items" :key="b.text" :item="b" />
  </div>
</template>

<style scoped>

</style>
