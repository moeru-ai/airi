<script setup lang="ts">
import { ScrollableArea } from '@proj-airi/ui'
import { computed, useTemplateRef } from 'vue'

defineOptions({
  inheritAttrs: false,
})

const props = defineProps<{
  variant: 'desktop' | 'mobile'
}>()

const desktopAreaRef = useTemplateRef<InstanceType<typeof ScrollableArea>>('desktop-area')
const mobileViewportRef = useTemplateRef<HTMLElement>('mobile-viewport')
const viewport = computed<HTMLElement | null>(() => props.variant === 'desktop'
  ? desktopAreaRef.value?.viewport ?? null
  : mobileViewportRef.value)

defineExpose({
  viewport,
})
</script>

<template>
  <ScrollableArea
    v-if="props.variant === 'desktop'"
    ref="desktop-area"
    v-bind="$attrs"
    type="auto"
    :viewport-class="[
      'chat-history-list',
    ]"
    :class="[
      'chat-history-scroll-area h-full w-full',
    ]"
  >
    <slot />
  </ScrollableArea>

  <div
    v-else
    ref="mobile-viewport"
    v-bind="$attrs"
    :class="[
      'chat-history-list chat-history-list--mobile',
      'relative h-full w-full overflow-y-auto rounded-xl',
      '<sm:px-2 <sm:py-2',
    ]"
  >
    <slot />
  </div>
</template>

<style scoped>
.chat-history-scroll-area {
  width: 100%;
  height: 100%;
}

.chat-history-scroll-area :deep(.chat-history-list) {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 0.75rem;
}

.chat-history-list--mobile {
  position: relative;
  width: 100%;
  height: 100%;
  overflow-y: auto;
  border-radius: 0.75rem;
}

.chat-history-list--mobile :deep(.chat-message-item-container) {
  --chat-top-fade-transparent-stop: -1px;
  --chat-top-fade-opaque-stop: 0px;

  -webkit-mask-image: linear-gradient(
    to bottom,
    transparent var(--chat-top-fade-transparent-stop),
    black var(--chat-top-fade-opaque-stop)
  );
  mask-image: linear-gradient(
    to bottom,
    transparent var(--chat-top-fade-transparent-stop),
    black var(--chat-top-fade-opaque-stop)
  );
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
}
</style>
