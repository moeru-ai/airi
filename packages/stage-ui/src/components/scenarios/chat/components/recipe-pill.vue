<script setup lang="ts">
/** A compact label that names a recipe in a chat reply. */
defineProps<{
  label: string
  name: string
  /** `executing` shows a spinner. `blocked` marks a recipe that could not run. */
  tone?: 'executing' | 'used' | 'blocked'
}>()
</script>

<template>
  <span
    :class="[
      'inline-flex max-w-full items-center gap-1.5',
      'rounded-full px-2.5 py-1',
      'text-xs',
      tone === 'blocked'
        ? 'bg-neutral-200/70 text-neutral-600 dark:bg-neutral-800/70 dark:text-neutral-300'
        : 'bg-primary-100/80 text-primary-700 dark:bg-primary-900/70 dark:text-primary-100',
    ]"
  >
    <span
      :class="[
        tone === 'executing' ? 'i-eos-icons:loading' : tone === 'blocked' ? 'i-solar:lock-keyhole-minimalistic-linear' : 'i-solar:book-bookmark-bold-duotone',
        'shrink-0 text-sm',
      ]"
      aria-hidden="true"
    />
    <span class="shrink-0 op-75">{{ label }}</span>
    <span class="truncate font-medium">{{ name }}</span>
    <slot />
  </span>
</template>
