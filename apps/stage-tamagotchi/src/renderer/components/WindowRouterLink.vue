<script setup lang="ts">
withDefaults(
  defineProps<{
    to: string
    label?: string
  }>(),
  {
    label: '',
  },
)
</script>

<template>
  <a cursor-pointer>
    <slot />
  </a>
</template>
