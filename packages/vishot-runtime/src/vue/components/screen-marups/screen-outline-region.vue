<script setup lang="ts">
import type { CSSProperties, StyleValue } from 'vue'

import { computed } from 'vue'

interface SceneOutlineRegionProps {
  class?: string | string[]
  borderColor?: string
  borderRadius?: number
  borderWidth?: number
  style?: StyleValue
}

const props = defineProps<SceneOutlineRegionProps>()

const outlineStyle = computed<CSSProperties>(() => ({
  border: `${props.borderWidth ?? 2}px solid ${props.borderColor ?? 'rgba(255, 255, 255, 0.96)'}`,
  borderRadius: `${props.borderRadius ?? 12}px`,
}))
</script>

<template>
  <div
    :class="[
      ...(props.class ? (typeof props.class === 'string' ? [props.class] : props.class) : []),
      'box-border',
      'pointer-events-none',
    ]"
    :style="[outlineStyle, props.style]"
  />
</template>
