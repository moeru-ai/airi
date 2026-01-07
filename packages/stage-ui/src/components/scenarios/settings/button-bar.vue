<script setup lang="ts">
import { Button } from '@proj-airi/ui'

import Bar from './bar.vue'

defineProps<{
  text: string
  icon: string
  description?: string
}>()

const emits = defineEmits<{
  (e: 'click'): void
}>()
</script>

<template>
  <Bar :text="text" :description="description">
    <Button @click="emits('click')">
      <slot />
    </Button>
  </Bar>
</template>
