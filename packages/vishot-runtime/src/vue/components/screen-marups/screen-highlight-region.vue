<script setup lang="ts">
import type { CSSProperties, StyleValue } from 'vue'

import { computed } from 'vue'

interface SceneHighlightRegionProps {
  borderColor?: string | string[]
  borderStyle?: string | string[]
  borderWidthClass?: string
  borderRadius?: number
  class?: string | string[]
  inset?: number
  style?: StyleValue
}

const props = withDefaults(defineProps<SceneHighlightRegionProps>(), {
  borderColor: 'border-white/95',
  borderStyle: 'border-solid',
  borderWidthClass: 'border-2',
})

const highlightStyle = computed<CSSProperties>(() => ({
  ...(props.borderRadius !== undefined
    ? {
        borderRadius: `${props.borderRadius}px`,
      }
    : {}),
  ...(props.inset !== undefined
    ? {
        margin: `${-props.inset}px`,
      }
    : {}),
}))
</script>

<template>
  <div
    :class="[
      ...(props.class ? (typeof props.class === 'string' ? [props.class] : props.class) : []),
      'box-border',
      'pointer-events-none',
      props.borderWidthClass,
      ...(typeof props.borderStyle === 'string' ? [props.borderStyle] : props.borderStyle),
      ...(typeof props.borderColor === 'string' ? [props.borderColor] : props.borderColor),
    ]"
    :style="[highlightStyle, props.style]"
  />
</template>
