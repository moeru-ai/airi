<script setup lang="ts">
defineProps<{
  title: string
  description: string
  icon: string
  to: string
}>()
</script>

<template>
  <RouterLink
    flex="~ row" bg="neutral-100 dark:neutral-800" hover="bg-neutral-200 dark:bg-neutral-700"
    class="[&_.settings-section-icon]:hover:scale-120" transition="all ease-in-out duration-200" relative w-full
    items-center overflow-hidden rounded-lg p-5 text-left
    :to="to"
  >
    <div z-1 flex-1>
      <div text-lg font-semibold>
        {{ title }}
      </div>
      <div text="sm neutral-600 dark:neutral-400">
        <span>{{ description }}</span>
      </div>
    </div>
    <div
      class="settings-section-icon"
      transition="all ease-in-out duration-500"
      absolute right-0 size-24 translate-y-4
      text="neutral-400/50 dark:neutral-600/50"
      :class="[icon]"
    />
  </RouterLink>
</template>
