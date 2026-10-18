<template>
  <!--
    Three columns keep the middle item centered on the screen when the side groups have different widths.
    Put the left item first, the middle item second, and the right group third.
  -->
  <header
    :class="[
      'pointer-events-none absolute inset-x-0 top-0 z-30',
      'grid grid-cols-[1fr_auto_1fr] items-center gap-2',
      'pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-[max(0.75rem,env(safe-area-inset-top))]',
    ]"
  >
    <slot />
  </header>
</template>
