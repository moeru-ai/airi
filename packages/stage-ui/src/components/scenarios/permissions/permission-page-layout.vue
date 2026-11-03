<script setup lang="ts">
defineProps<{
  title: string
  description: string
}>()
</script>

<template>
  <div :class="['@container min-h-0 flex flex-1 flex-col']">
    <!--
      The flow animates this root, so a comment must not come before it: Vue keeps comments in a dev build, and a
      fragment root stops the page transition. The width of this page decides the layout, not the window, because the
      web shows the flow in a narrow dialog. A wide page puts the text on the left and the stage on the right.
    -->
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
      <!-- A narrow page has no room to frame the stage, so the stage has a panel only on a wide page. -->
      <div :class="['relative h-56 flex shrink-0 flex-col items-center justify-center overflow-hidden @3xl:h-105 @3xl:rounded-3xl', '@3xl:bg-neutral-100 dark:@3xl:bg-neutral-800/50']">
        <slot name="stage" />
      </div>
    </div>
  </div>
</template>
