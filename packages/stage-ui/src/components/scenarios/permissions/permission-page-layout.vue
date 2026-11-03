<script setup lang="ts">
defineProps<{
  title: string
  description: string
}>()
</script>

<template>
  <div :class="['min-h-0 flex flex-1 flex-col gap-6 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,420px)] md:items-center md:gap-12']">
    <!-- Text on the left and the stage on the right. A narrow window, for example a phone, stacks them. The flow animates this root, so it is one element. -->
    <div :class="['flex flex-col gap-3.5']">
      <h2 :class="['m-0 text-2xl text-neutral-900 font-bold leading-tight md:text-3xl dark:text-neutral-50']">
        {{ title }}
      </h2>
      <p :class="['m-0 text-[15px] text-neutral-500 leading-relaxed dark:text-neutral-400']">
        {{ description }}
      </p>
      <slot />
    </div>
    <div :class="['relative h-56 flex shrink-0 flex-col items-center justify-center overflow-hidden rounded-3xl md:h-105', 'bg-neutral-100 dark:bg-neutral-800/50']">
      <slot name="stage" />
    </div>
  </div>
</template>
