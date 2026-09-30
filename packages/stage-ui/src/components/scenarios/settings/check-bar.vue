<script setup lang="ts">
import { Checkbox } from '@proj-airi/ui'

import Bar from './bar.vue'

defineProps<{
  text: string
  description?: string
  disabled?: boolean
}>()
const model = defineModel<boolean>({ required: true })
</script>

<template>
  <Bar :text="text" :description="description">
    <Checkbox v-model="model" :disabled="disabled" :aria-label="$t(text)" />
  </Bar>
</template>
