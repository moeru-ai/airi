<script setup lang="ts">
defineProps<{
  href: string
}>()
</script>

<template>
  <a
    :href="href"
    class="group relative inline-flex items-center border-primary/20 rounded-lg bg-primary/10 px-3 py-1 text-sm text-primary font-semibold transition"
  >
    <slot />
  </a>
</template>
