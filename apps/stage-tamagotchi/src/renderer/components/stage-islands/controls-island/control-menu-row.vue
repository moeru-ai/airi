<script setup lang="ts">
withDefaults(defineProps<{
  label: string
  icon?: string
  iconClass?: string
}>(), {
  iconClass: 'size-5',
})
</script>

<template>
  <button
    type="button"
    :class="[
      'w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2',
      'bg-transparent hover:bg-black/5 dark:hover:bg-white/5',
      'text-sm text-neutral-800 font-medium dark:text-neutral-200',
      'cursor-pointer border-none outline-none transition-colors duration-200',
      'focus-visible:outline-2 focus-visible:outline-primary-500',
    ]"
  >
    <span
      aria-hidden="true"
      :class="[
        'w-8 inline-flex shrink-0 items-center justify-center',
        'text-neutral-500 dark:text-neutral-400',
      ]"
    >
      <slot name="leading">
        <span :class="[icon, iconClass]" />
      </slot>
    </span>
    <span :class="['min-w-0 flex-1 truncate text-left']">{{ label }}</span>
    <slot />
  </button>
</template>
