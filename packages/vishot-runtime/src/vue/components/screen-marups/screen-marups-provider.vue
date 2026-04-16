<script setup lang="ts">
import type { CSSProperties } from 'vue'

import { computed } from 'vue'

interface SceneMarkupProviderProps {
  height: number
  width: number
}

const props = defineProps<SceneMarkupProviderProps>()

const viewportStyle = computed<CSSProperties>(() => ({
  position: 'relative',
  width: `${props.width}px`,
  height: `${props.height}px`,
  overflow: 'hidden',
}))

const sceneStyle = computed<CSSProperties>(() => ({
  position: 'absolute',
  left: '0px',
  top: '0px',
  width: `${props.width}px`,
  height: `${props.height}px`,
}))

const overlayStyle = computed<CSSProperties>(() => ({
  position: 'absolute',
  inset: '0px',
  pointerEvents: 'none',
}))
</script>

<template>
  <div :style="viewportStyle">
    <div :style="sceneStyle">
      <slot />
    </div>
    <div :style="overlayStyle">
      <slot name="overlay" />
    </div>
  </div>
</template>
