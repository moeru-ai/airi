<script setup lang="ts">
defineProps<{
  text: string
  description?: string
}>()
</script>

<template>
  <label
    class="w-full flex cursor-pointer items-center justify-between rounded-lg px-4 py-3 text-sm outline-none transition-all duration-250 ease-in-out"
    bg="neutral-50 dark:neutral-800"
    hover="bg-neutral-200 dark:bg-neutral-700"
  >
    <div>
      {{ $t(text) }}
      <div v-if="description" text="sm neutral-500">
        {{ $t(description) }}
      </div>
    </div>
    <slot />
  </label>
</template>
