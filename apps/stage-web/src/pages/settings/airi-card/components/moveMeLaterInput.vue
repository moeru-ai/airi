<script setup lang="ts">
interface Props {
  label: string
  long?: boolean
  required?: boolean
  placeholder?: string
  isActive?: boolean
}

withDefaults(defineProps<Props>(), {
  long: false,
  placeholder: 'Type something here...',
  isActive: true,
  required: false,
})

// value is a Ref
const value = defineModel<string>() // Linked to v-model when this element is placed somewhere
</script>

<template>
  <div class="flex flex-col gap-1">
    <label>{{ label }}<span v-if="required" class="ml-2 text-xs color-red-400">Required</span></label>
    <textarea
      v-if="long"
      v-model="value" type="string"
      class="rounded-xl p-2.5 text-sm outline-none"
      :class="value.length !== 0 || !required ? 'bg-white dark:bg-neutral-900' : 'bg-red-900'"
      border="focus:primary-100 dark:focus:primary-400/50 2 solid neutral-200 dark:neutral-800"
      transition="all duration-200 ease-in-out"
    />

    <input
      v-else
      v-model="value" type="string"
      class="rounded-xl p-2.5 text-sm outline-none"
      :class="value.length !== 0 || !required ? 'bg-white dark:bg-neutral-900' : 'bg-red-900'"
      border="focus:primary-100 dark:focus:primary-400/50 2 solid neutral-200 dark:neutral-800"
      transition="all duration-200 ease-in-out"
    >
  </div>
</template>
