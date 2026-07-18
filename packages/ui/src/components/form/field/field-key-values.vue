<script setup lang="ts">
import { ref, watch } from 'vue'

import { InputKeyValue } from '../input'

const props = defineProps<{
  label?: string
  description?: string
  name?: string
  keyPlaceholder?: string
  valuePlaceholder?: string
  required?: boolean
  inputClass?: string
}>()

const emit = defineEmits<{
  (e: 'remove', index: number): void
  (e: 'add', key: string, value: string): void
}>()

const keyValues = defineModel<{ key: string, value: string }[]>({ required: true })
const inputKey = ref('')
const inputValue = ref('')

watch([inputKey, inputValue], () => {
  emit('add', inputKey.value, inputValue.value)
})
</script>

<template>
  <div class="max-w-full">
    <label class="flex flex-col gap-2">
      <div>
        <div class="flex items-center gap-1 text-sm font-medium">
          <slot name="label">
            {{ props.label }}
          </slot>
          <span v-if="props.required !== false" class="text-red-500">*</span>
        </div>
        <div class="text-xs text-neutral-500 dark:text-neutral-400">
          <slot name="description">
            {{ props.description }}
          </slot>
        </div>
      </div>
      <div v-auto-animate class="flex flex-col gap-2">
        <div
          v-for="(keyValue, index) in keyValues"
          :key="index"
          class="w-full flex items-center gap-2"
        >
          <InputKeyValue
            v-model:property-key="keyValue.key"
            v-model:property-value="keyValue.value"
            :key-placeholder="props.keyPlaceholder"
            :value-placeholder="props.valuePlaceholder"
            class="w-full"
          />
          <button @click="emit('remove', index)">
            <div i-solar:minus-circle-line-duotone size="6" />
          </button>
        </div>
      </div>
    </label>
  </div>
</template>
