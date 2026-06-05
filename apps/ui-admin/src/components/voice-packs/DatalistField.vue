<script setup lang="ts">
defineProps<{
  label: string
  description?: string
  listId: string
  options: Array<{ label: string, value: string, description?: string }>
  placeholder?: string
  required?: boolean
  inputClass?: string
}>()

const modelValue = defineModel<string>({ default: '' })
</script>

<template>
  <label :class="['block']">
    <span :class="['mb-1', 'block', 'text-xs', 'font-semibold', 'uppercase', 'text-neutral-500']">
      {{ label }}
      <span v-if="required" :class="['text-red-500']">*</span>
    </span>
    <span v-if="description" :class="['mb-2', 'block', 'text-xs', 'text-neutral-500']">
      {{ description }}
    </span>
    <input
      v-model="modelValue"
      :class="[
        'field',
        inputClass,
      ]"
      :list="listId"
      :placeholder="placeholder"
      :required="required"
      type="text"
    >
    <datalist :id="listId">
      <option
        v-for="option in options"
        :key="`${listId}-${option.value}`"
        :label="option.description ? `${option.label} - ${option.description}` : option.label"
        :value="option.value"
      />
    </datalist>
  </label>
</template>
