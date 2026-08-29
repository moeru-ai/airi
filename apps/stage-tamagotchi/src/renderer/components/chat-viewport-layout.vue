<script setup lang="ts">
import { useElementSize, useMutationObserver, useResizeObserver } from '@vueuse/core'
import { computed, nextTick, onMounted, ref, shallowRef, useTemplateRef } from 'vue'

const composerRef = useTemplateRef<HTMLElement>('composer')
const historyLayerRef = useTemplateRef<HTMLElement>('history-layer')
const historyRef = shallowRef<HTMLElement>()
const { height: composerHeight } = useElementSize(composerRef)
const scrollbarWidth = ref(0)

function updateScrollbarWidth() {
  const history = historyRef.value
  const customScrollbar = historyLayerRef.value?.querySelector<HTMLElement>('.scrollable-area-scrollbar--vertical')
  const customScrollbarWidth = customScrollbar && customScrollbar.dataset.state !== 'hidden'
    ? customScrollbar.getBoundingClientRect().width
    : 0
  const nativeScrollbarWidth = history
    ? Math.max(0, history.offsetWidth - history.clientWidth)
    : 0
  scrollbarWidth.value = customScrollbarWidth || nativeScrollbarWidth
}

onMounted(async () => {
  await nextTick()
  historyRef.value = historyLayerRef.value?.querySelector<HTMLElement>('.chat-history-list') ?? undefined
  updateScrollbarWidth()
})

useResizeObserver(historyRef, updateScrollbarWidth)
useMutationObserver(historyLayerRef, updateScrollbarWidth, {
  attributeFilter: ['data-state'],
  attributes: true,
  childList: true,
  subtree: true,
})

const layoutStyle = computed(() => ({
  '--chat-composer-height': `${composerHeight.value}px`,
  '--chat-scrollbar-width': `${scrollbarWidth.value}px`,
}))
</script>

<template>
  <div
    data-testid="chat-viewport-layout"
    :style="layoutStyle"
    :class="[
      'chat-viewport-layout',
    ]"
  >
    <div
      ref="history-layer"
      data-testid="chat-history-layer"
      :class="[
        'chat-history-layer',
      ]"
    >
      <slot name="history" />
    </div>

    <div
      ref="composer"
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
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.chat-history-layer {
  position: absolute;
  inset: 0;
}

.chat-composer-layer {
  position: absolute;
  right: calc(1rem + var(--chat-scrollbar-width));
  bottom: 1rem;
  left: 1rem;
  z-index: 20;
}

.chat-viewport-layout :deep(.chat-history-list) {
  box-sizing: border-box;
  border-radius: 0 !important;
  padding: 1rem;
  padding-bottom: calc(var(--chat-composer-height) + 2rem);
}
</style>
