<script setup lang="ts">
defineProps<{
  title?: string
  description?: string
  onReset?: () => void
}>()
</script>

<template>
  <div flex="~ col gap-6">
    <div flex="~ row" items-center justify-between>
      <div>
        <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-400">
          {{ title || 'Basic' }}
        </h2>
        <div text="neutral-400 dark:neutral-500">
          <span>{{ description || 'Essential settings' }}</span>
        </div>
      </div>
      <button
        v-if="onReset"
        title="Reset settings"
        flex items-center justify-center rounded-full p-2
        transition="all duration-250 ease-in-out"
        text="neutral-500 dark:neutral-400"
        bg="transparent dark:transparent hover:neutral-200 dark:hover:neutral-800 active:neutral-300 dark:active:neutral-700"
        @click="onReset"
      >
        <div i-solar:refresh-bold-duotone text-xl />
      </button>
    </div>
    <slot />
  </div>
</template>
