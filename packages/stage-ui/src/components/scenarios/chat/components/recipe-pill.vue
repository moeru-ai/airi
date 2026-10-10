<script setup lang="ts">
/** A compact label that names a recipe in a chat reply. */
defineProps<{
  label: string
  name: string
  /** `executing` shows a spinner. `blocked` marks a recipe that did not run. */
  tone?: 'executing' | 'used' | 'blocked'
  /** How the label paints its background when it sits outside a bubble; see `ChatHistory`'s `surface`. */
  surface?: 'translucent' | 'opaque'
}>()
</script>

<template>
  <span
    :class="[
      'inline-flex max-w-full items-center gap-1.5',
      'rounded-full px-2.5 py-1',
      'text-xs',
      tone === 'blocked' ? 'text-neutral-600 dark:text-neutral-300' : 'text-primary-700 dark:text-primary-100',
      surface === 'opaque'
        ? ['shadow-md', tone === 'blocked' ? 'bg-neutral-200 dark:bg-neutral-800' : 'bg-primary-100 dark:bg-primary-900']
        : tone === 'blocked' ? 'bg-neutral-200/70 dark:bg-neutral-800/70' : 'bg-primary-100/80 dark:bg-primary-900/70',
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
