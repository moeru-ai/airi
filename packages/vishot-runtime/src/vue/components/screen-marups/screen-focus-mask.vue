<script setup lang="ts">
import type { CSSProperties, StyleValue } from 'vue'

import { computed } from 'vue'

interface SceneFocusMaskProps {
  blurPx?: number
  class?: string | string[]
  color?: string
  mode?: 'blur' | 'dim'
  opacity?: number
  style?: StyleValue
}

const props = withDefaults(defineProps<SceneFocusMaskProps>(), {
  blurPx: 8,
  color: '0, 0, 0',
  mode: 'dim',
  opacity: 0.42,
})

const surfaceStyle = computed<CSSProperties>(() => ({
  backgroundColor: `rgba(${props.color}, ${props.opacity})`,
  backdropFilter: props.mode === 'blur' ? `blur(${props.blurPx}px)` : undefined,
}))
</script>

<template>
  <div
    :class="[
      ...(props.class ? (typeof props.class === 'string' ? [props.class] : props.class) : []),
      'absolute inset-0 pointer-events-none',
    ]"
    :style="[surfaceStyle, props.style]"
  />
</template>
