<script setup lang="ts">
import { Button } from '@proj-airi/ui'

import Bar from './bar.vue'

withDefaults(
  defineProps<{
    text: string
    description?: string
  }>(),
  {
    description: '',
  },
)

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
