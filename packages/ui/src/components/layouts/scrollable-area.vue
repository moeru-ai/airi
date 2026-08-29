<script setup lang="ts">
import type { ScrollAreaRootProps } from 'reka-ui'

import { ScrollAreaCorner, ScrollAreaRoot, ScrollAreaScrollbar, ScrollAreaThumb, ScrollAreaViewport } from 'reka-ui'
import { computed, useTemplateRef } from 'vue'

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(defineProps<ScrollableAreaProps>(), {
  contentAsChild: false,
  orientation: 'vertical',
  type: 'auto',
  viewportClass: undefined,
})

type ScrollableAreaOrientation = 'vertical' | 'horizontal' | 'both'

interface ScrollableAreaProps {
  contentAsChild?: boolean
  orientation?: ScrollableAreaOrientation
  type?: ScrollAreaRootProps['type']
  viewportClass?: string | string[]
}

const rootRef = useTemplateRef<{ viewport: HTMLElement | undefined }>('root')
const viewport = computed(() => rootRef.value?.viewport)

defineExpose({
  viewport,
})
</script>

<template>
  <ScrollAreaRoot
    ref="root"
    v-bind="$attrs"
    :type="props.type"
    :class="[
      'relative min-h-0 min-w-0 overflow-hidden',
    ]"
  >
    <ScrollAreaViewport
      :as-child="props.contentAsChild"
      :style="{
        height: '100%',
        maxHeight: 'inherit',
        maxWidth: 'inherit',
        width: '100%',
      }"
      :class="[
        'h-full w-full rounded-[inherit]',
        props.viewportClass,
      ]"
    >
      <slot />
    </ScrollAreaViewport>

    <ScrollAreaScrollbar
      v-if="props.orientation === 'vertical' || props.orientation === 'both'"
      orientation="vertical"
      :style="{
        display: 'flex',
        width: '0.625rem',
      }"
      :class="[
        'scrollable-area-scrollbar scrollable-area-scrollbar--vertical',
        'z-10 touch-none select-none p-0.5',
        'transition-colors duration-150',
      ]"
    >
      <ScrollAreaThumb
        :style="{
          width: '100%',
        }"
        :class="[
          'scrollable-area-thumb--vertical',
          'relative rounded-full',
          'bg-neutral-400/55 hover:bg-neutral-500/70',
          'dark:bg-neutral-600/65 dark:hover:bg-neutral-500/80',
        ]"
      />
    </ScrollAreaScrollbar>

    <ScrollAreaScrollbar
      v-if="props.orientation === 'horizontal' || props.orientation === 'both'"
      orientation="horizontal"
      :style="{
        display: 'flex',
        flexDirection: 'column',
        height: '0.625rem',
      }"
      :class="[
        'scrollable-area-scrollbar scrollable-area-scrollbar--horizontal',
        'z-10 touch-none select-none p-0.5',
        'transition-colors duration-150',
      ]"
    >
      <ScrollAreaThumb
        :style="{
          height: '100%',
        }"
        :class="[
          'scrollable-area-thumb--horizontal',
          'relative rounded-full',
          'bg-neutral-400/55 hover:bg-neutral-500/70',
          'dark:bg-neutral-600/65 dark:hover:bg-neutral-500/80',
        ]"
      />
    </ScrollAreaScrollbar>

    <ScrollAreaCorner v-if="props.orientation === 'both'" />
  </ScrollAreaRoot>
</template>
