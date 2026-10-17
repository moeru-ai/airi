<script setup lang="ts">
defineProps<{ floating?: boolean }>()
</script>

<template>
  <div
    data-testid="desktop-chat-page-shell"
    :class="[
      'h-full w-full flex flex-col overflow-hidden',
      floating ? 'pt-3 bg-transparent' : 'pt-11 bg-neutral-50 dark:bg-neutral-950',
    ]"
    :style="{ overflow: 'hidden' }"
  >
    <slot />
  </div>
</template>
