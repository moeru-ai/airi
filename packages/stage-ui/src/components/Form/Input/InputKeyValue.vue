<script setup lang="ts">
import Input from './Input.vue'

const props = defineProps<{
  name?: string
  keyPlaceholder?: string
  valuePlaceholder?: string
}>()

const key = defineModel<string>('propertyKey', { required: true })
const value = defineModel<string>('propertyValue', { required: true })
</script>

<template>
  <div flex="~ gap-2">
    <Input v-model="key" :placeholder="props.keyPlaceholder" class="w-1/2" />
    <Input v-model="value" :placeholder="props.valuePlaceholder" class="w-1/2" />
  </div>
</template>
