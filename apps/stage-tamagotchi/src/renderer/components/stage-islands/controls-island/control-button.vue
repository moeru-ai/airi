<script setup lang="ts">
const props = defineProps<{ buttonStyle?: string }>()
</script>

<template>
  <button
    :class="[
      'border-2 border-solid border-neutral-200/60 dark:border-neutral-800/10',
      'bg-neutral-50/80 dark:bg-neutral-800/70',
      'w-fit flex items-center self-end justify-center p-2',
      'rounded-xl backdrop-blur-md',
      'transition-all hover:transition-none transition-duration-300 transition-ease-out',
      props.buttonStyle,
    ]"
  >
    <slot />
  </button>
</template>
