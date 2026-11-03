<script setup lang="ts">
defineProps<{
  title: string
  description: string
}>()
</script>

<template>
  <!-- The width of this page decides the layout, not the window, because the web shows the flow in a narrow dialog. -->
  <div :class="['@container min-h-0 flex flex-1 flex-col']">
    <!-- Text on the left and the stage on the right. A narrow page, for example in a dialog or on a phone, stacks them. -->
    <div :class="['min-h-0 flex flex-1 flex-col gap-6 @3xl:grid @3xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)] @3xl:items-center @3xl:gap-12']">
      <div :class="['flex flex-col gap-3.5']">
        <h2 :class="['m-0 text-2xl text-neutral-900 font-bold leading-tight @3xl:text-3xl dark:text-neutral-50']">
          {{ title }}
        </h2>
        <p :class="['m-0 text-[15px] text-neutral-500 leading-relaxed dark:text-neutral-400']">
          {{ description }}
        </p>
        <slot />
      </div>
      <div :class="['relative h-56 flex shrink-0 flex-col items-center justify-center overflow-hidden rounded-3xl @3xl:h-105', 'bg-neutral-100 dark:bg-neutral-800/50']">
        <slot name="stage" />
      </div>
    </div>
  </div>
</template>
