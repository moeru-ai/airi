<script setup lang="ts">
import type { Live2DContext } from '../../contexts/live2d'

import { onUnmounted } from 'vue'

import { createLive2D, provideLive2D } from '../../contexts/live2d'

const props = defineProps<{
  context?: Live2DContext
}>()

const ownsContext = !props.context
const context = props.context ?? createLive2D()

provideLive2D(context)

onUnmounted(() => {
  if (ownsContext)
    context.dispose()
})

defineExpose({ context })
</script>

<template>
  <slot :context="context" />
</template>
