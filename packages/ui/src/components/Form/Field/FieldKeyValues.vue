<script setup lang="ts">
import { ref, watch } from 'vue'

import InputKeyValue from '../Input/InputKeyValue.vue'

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
  <div max-w-full>
    <label flex="~ col gap-2">
      <div>
        <div class="flex items-center gap-1 text-sm font-medium">
          <slot name="label">
            {{ props.label }}
          </slot>
          <span v-if="props.required !== false" class="text-red-500">*</span>
        </div>
        <div class="text-xs text-neutral-500 dark:text-neutral-400" text-nowrap>
          <slot name="description">
            {{ props.description }}
          </slot>
        </div>
      </div>
      <div v-auto-animate flex="~ col gap-2">
        <div
          v-for="(keyValue, index) in keyValues"
          :key="index"
          w-full flex items-center gap-2
        >
          <InputKeyValue
            v-model:property-key="keyValue.key"
            v-model:property-value="keyValue.value"
            :key-placeholder="props.keyPlaceholder"
            :value-placeholder="props.valuePlaceholder"
            w-full
          />
          <button @click="emit('remove', index)">
            <div i-solar:minus-circle-line-duotone size="6" />
          </button>
        </div>
      </div>
    </label>
  </div>
</template>
