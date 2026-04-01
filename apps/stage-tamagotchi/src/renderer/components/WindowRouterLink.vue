<script setup lang="ts">
defineProps<{
  to: string
  label?: string
}>()
</script>

<template>
  <a cursor-pointer>
    <slot />
  </a>
</template>
