<script setup lang="ts">
import { useElementSize } from '@vueuse/core'
import { computed, useTemplateRef } from 'vue'

defineSlots<{
  composer: () => unknown
  history: (props: { tailInset: number }) => unknown
}>()

const composerLayer = useTemplateRef<HTMLElement>('composer-layer')
const { height: composerHeight } = useElementSize(composerLayer, undefined, { box: 'border-box' })
const layoutStyle = computed(() => ({
  '--chat-composer-height': `${composerHeight.value}px`,
}))
</script>

<template>
  <div
    data-testid="chat-viewport-layout"
    :class="[
      'chat-viewport-layout',
    ]"
    :style="layoutStyle"
  >
    <div
      data-testid="chat-history-layer"
      :class="[
        'chat-history-layer',
      ]"
    >
      <slot name="history" :tail-inset="composerHeight" />
    </div>

    <div
      ref="composer-layer"
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
  grid-template-areas: 'chat-stack';
  grid-template-rows: minmax(0, 1fr);
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.chat-history-layer {
  grid-area: chat-stack;
  position: relative;
  min-height: 0;
}

.chat-composer-layer {
  grid-area: chat-stack;
  align-self: end;
  position: relative;
  z-index: 20;
  min-height: 0;
  max-height: calc(100% - 1rem);
  margin: 0 1rem 1rem;
  overflow: hidden;
}

.chat-viewport-layout :deep(.chat-history-list) {
  --chat-history-bottom-inset: calc(var(--chat-composer-height) + 1rem);

  box-sizing: border-box;
  border-radius: 0 !important;
  padding: 1rem;
}

.chat-viewport-layout :deep(.chat-history-list)::after {
  display: block;
  height: var(--chat-history-bottom-inset);
  content: '';
  pointer-events: none;
}
</style>
