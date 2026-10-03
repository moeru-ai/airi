<template>
  <div
    data-testid="desktop-chat-page-shell"
    :class="[
      'h-full w-full overflow-hidden pt-11',
      'bg-neutral-50 dark:bg-neutral-950',
    ]"
    :style="{
      overflow: 'hidden',
    }"
  >
    <slot />
  </div>
</template>
