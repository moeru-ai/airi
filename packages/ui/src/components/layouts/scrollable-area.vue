<script setup lang="ts">
import type { ScrollAreaRootProps } from 'reka-ui'
import type { PropType } from 'vue'

import { injectScrollAreaRootContext, ScrollAreaCorner, ScrollAreaRoot, ScrollAreaScrollbar, ScrollAreaThumb, ScrollAreaViewport } from 'reka-ui'
import { computed, defineComponent, nextTick, useTemplateRef, watch } from 'vue'

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

// NOTICE:
// Reka UI 2.10.3 clears both axis flags when either scrollbar unmounts.
// Restore the requested flags after the scrollbar DOM update.
// Source: https://github.com/moeru-ai/airi/pull/2399#discussion_r3886316598
// Remove this controller when Reka only clears the axis owned by its scrollbar.
const ScrollAreaAxisController = defineComponent({
  props: {
    orientation: {
      type: String as PropType<ScrollableAreaOrientation>,
      required: true,
    },
  },
  setup(controllerProps) {
    const rootContext = injectScrollAreaRootContext()

    watch(
      () => controllerProps.orientation,
      async (orientation) => {
        await nextTick()
        rootContext.onScrollbarXEnabledChange(orientation === 'horizontal' || orientation === 'both')
        rootContext.onScrollbarYEnabledChange(orientation === 'vertical' || orientation === 'both')
      },
      { flush: 'post', immediate: true },
    )

    return () => null
  },
})

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
    <ScrollAreaAxisController :orientation="props.orientation" />

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
