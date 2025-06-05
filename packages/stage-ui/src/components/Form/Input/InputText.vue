<script setup lang="ts">
import { ref } from 'vue'

interface Props {
  label: string
  long?: boolean
  required?: boolean
}

withDefaults(defineProps<Props>(), {
  long: false,
  placeholder: 'Type something here...',
  isActive: true,
  required: false,
})

// value is a Ref
const value = defineModel<string>({ default: '' }) // Linked to v-model when this element is placed somewhere
const usedInput = ref<boolean>(false)
</script>

<template>
  <div class="flex flex-col gap-1">
    <label>{{ label }}<span v-if="required" class="ml-2 text-xl color-red-400">*</span></label><!-- * can be replaced by "Required", and text size set to text-xs -->
    <textarea
      v-if="long"
      v-model="value" type="string"
      class="rounded-xl p-2.5 text-sm outline-none"
      :class="value.length !== 0 || !required || !usedInput ? 'bg-white dark:bg-neutral-900' : 'bg-red-900'"
      border="focus:primary-100 dark:focus:primary-400/50 2 solid neutral-200 dark:neutral-800"
      transition="all duration-200 ease-in-out"
      @blur="usedInput = true"
    />

    <input
      v-else
      v-model="value" type="string"
      class="rounded-xl p-2.5 text-sm outline-none"
      :class="value.length !== 0 || !required || !usedInput ? 'bg-white dark:bg-neutral-900' : 'bg-red-900'"
      border="focus:primary-100 dark:focus:primary-400/50 2 solid neutral-200 dark:neutral-800"
      transition="all duration-200 ease-in-out"
      @blur="usedInput = true"
    >
  </div>
</template>
