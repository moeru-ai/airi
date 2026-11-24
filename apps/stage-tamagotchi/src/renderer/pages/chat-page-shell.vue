<template>
  <!-- The page of the classic chat window. The window is opaque, so the page paints a solid surface. -->
  <div
    data-testid="desktop-chat-page-shell"
    :class="['h-full w-full overflow-hidden pt-11 bg-neutral-50 dark:bg-neutral-950']"
  >
    <slot />
  </div>
</template>
