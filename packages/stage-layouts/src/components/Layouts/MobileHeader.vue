<template>
  <header
    :class="[
      'pointer-events-none absolute inset-x-0 top-0 z-30',
      'flex items-center justify-between',
      'pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-[max(0.75rem,env(safe-area-inset-top))]',
    ]"
  >
    <slot />
  </header>
</template>
