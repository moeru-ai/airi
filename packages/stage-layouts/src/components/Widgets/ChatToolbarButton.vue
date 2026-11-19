<script setup lang="ts">
defineOptions({ inheritAttrs: false })

withDefaults(defineProps<{
  active?: boolean
}>(), {
  active: false,
})
</script>

<template>
  <button
    v-bind="$attrs"
    type="button"
    :class="[
      'size-9 shrink-0 flex items-center justify-center rounded-lg outline-none',
      'text-lg transition-colors transition-transform duration-200 active:scale-95 motion-reduce:transition-none',
      'focus-visible:outline-2 focus-visible:outline-primary-500 focus-visible:outline-offset-2',
      active
        ? 'bg-primary-100 text-primary-600 dark:bg-primary-900/40 dark:text-primary-300'
        : 'bg-neutral-100 text-neutral-500 hover:bg-primary-100/60 hover:text-primary-600 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-primary-900/40 dark:hover:text-primary-300',
    ]"
  >
    <slot />
  </button>
</template>
