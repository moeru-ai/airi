<script setup lang="ts">
import HeaderAvatar from './HeaderAvatar.vue'
</script>

<template>
  <header
    :class="[
      'mb-1 w-full px-2',
      'flex items-center justify-end gap-2',
    ]"
  >
    <HeaderAvatar compact />
  </header>
</template>
