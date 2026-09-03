<script setup lang="ts">
import type { Live2DContext } from '../../contexts/live2d'

import { onUnmounted, watch } from 'vue'

import { createLive2D, provideLive2D } from '../../contexts/live2d'

const props = defineProps<{
  context?: Live2DContext
  source?: string
  modelId?: string
}>()

const emit = defineEmits<{
  error: [error: Error]
}>()

const ownsContext = !props.context
const context = props.context ?? createLive2D()
let ownsSourceBinding = false

provideLive2D(context)

// The Stage publishes a model ID before it resolves the matching object URL.
// The source is the load boundary. Watching the ID would pair a new ID with
// the previous source and start an unnecessary model load.
watch(
  () => props.source,
  (source) => {
    if (source) {
      ownsSourceBinding = true
      context.load(source, props.modelId)
      return
    }

    if (ownsContext || ownsSourceBinding) {
      context.unload()
      ownsSourceBinding = false
    }
  },
  { immediate: true },
)

watch(context.error, (error) => {
  if (error)
    emit('error', error.cause)
})

onUnmounted(() => {
  if (ownsContext)
    context.dispose()
  else if (ownsSourceBinding)
    context.unload()
})

defineExpose({ context })
</script>

<template>
  <slot :context="context" />
</template>
