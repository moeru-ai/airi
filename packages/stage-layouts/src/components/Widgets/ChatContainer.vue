<template>
  <div
    :class="[
      'flex flex-col h-full w-full rounded-xl',
      'bg-primary-50/50 dark:bg-primary-950/70 backdrop-blur-md',
    ]"
  >
    <slot />
  </div>
</template>
