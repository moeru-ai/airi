<script setup lang="ts">
import Checkbox from '../Checkbox/Checkbox.vue'

const props = defineProps<{
  label?: string
  description?: string
}>()

const modelValue = defineModel<boolean>({ required: true })
</script>

<template>
  <label flex="~ col gap-4" @click="console.log('🎤 FieldCheckbox label clicked, modelValue:', modelValue)">
    <div flex="~ row" items-center gap-2>
      <div flex="1">
        <div class="flex items-center gap-1 text-sm font-medium">
          <slot name="label">
            {{ props.label }}
          </slot>
        </div>
        <div class="text-xs text-neutral-500 dark:text-neutral-400">
          <slot name="description">
            {{ props.description }}
          </slot>
        </div>
      </div>
      <Checkbox v-model="modelValue" @update:model-value="(value) => console.log('🎤 Checkbox model updated:', value)" />
    </div>
  </label>
</template>
