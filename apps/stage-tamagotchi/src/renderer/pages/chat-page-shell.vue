<template>
  <div
    data-testid="desktop-chat-page-shell"
    :class="[
      'h-full w-full overflow-hidden pt-11',
      'bg-gradient-to-b from-primary-50/50 to-neutral-50 dark:from-primary-950/20 dark:to-neutral-950',
    ]"
    :style="{
      overflow: 'hidden',
    }"
  >
    <slot />
  </div>
</template>
