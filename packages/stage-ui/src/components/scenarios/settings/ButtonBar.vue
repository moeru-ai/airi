<script setup lang="ts">
import Bar from './Bar.vue'

import { Button } from '../../misc'

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
