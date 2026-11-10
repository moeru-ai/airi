<template>
  <div
    data-testid="desktop-chat-page-shell"
    :class="[
      'h-full w-full overflow-hidden pt-11',
    ]"
    :style="{
      overflow: 'hidden',
    }"
  >
    <slot />
  </div>
</template>
