<script setup lang="ts">
import { provide } from 'vue'

import { injectDockSize } from './constants'

const props = withDefaults(defineProps<{
  size?: number
}>(), {
  size: 1,
})

provide(injectDockSize, props.size)
</script>

<template>
  <slot />
</template>
