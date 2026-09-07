<template>
  <div
    data-testid="chat-viewport-layout"
    :class="[
      'chat-viewport-layout',
    ]"
  >
    <div
      data-testid="chat-history-layer"
      :class="[
        'chat-history-layer',
      ]"
    >
      <slot name="history" />
    </div>

    <div
      data-testid="chat-composer-layer"
      :class="[
        'chat-composer-layer',
      ]"
    >
      <slot name="composer" />
    </div>
  </div>
</template>

<style scoped>
.chat-viewport-layout {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.chat-history-layer {
  position: relative;
  min-height: 0;
}

.chat-composer-layer {
  position: relative;
  z-index: 20;
  min-height: 0;
  max-height: calc(100% - 1rem);
  margin: 0 1rem 1rem;
  overflow: hidden;
}

.chat-viewport-layout :deep(.chat-history-list) {
  box-sizing: border-box;
  border-radius: 0 !important;
  padding: 1rem;
  padding-bottom: 1rem;
}
</style>
