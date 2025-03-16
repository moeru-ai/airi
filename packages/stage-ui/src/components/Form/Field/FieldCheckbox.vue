<script setup lang="ts">
import Checkbox from '../Checkbox/Checkbox.vue'

const props = defineProps<{
  label?: string
  description?: string
}>()

const modelValue = defineModel<boolean>({ required: true })
</script>

<template>
  <label flex="~ col gap-4">
    <div flex="~ row" items-center gap-2>
      <div flex="1">
        <div class="flex items-center gap-1 text-sm font-medium">
          {{ props.label }}
        </div>
        <div class="text-xs text-neutral-500 dark:text-neutral-400">
          {{ props.description }}
        </div>
      </div>
      <Checkbox v-model="modelValue" />
    </div>
  </label>
</template>
