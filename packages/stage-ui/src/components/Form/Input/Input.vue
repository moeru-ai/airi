<script setup lang="ts">
const props = defineProps<{
  type?: string
}>()

const modelValue = defineModel<string>({ required: true })
</script>

<template>
  <input
    v-model="modelValue"
    :type="props.type || 'text'"
    border="focus:primary-100 dark:focus:primary-400/50 2 solid neutral-200 dark:neutral-800"
    transition="all duration-200 ease-in-out"
    text="disabled:neutral-400 dark:disabled:neutral-600"
    cursor="disabled:not-allowed"
    w-full rounded-lg px-2 py-1 text-nowrap text-sm outline-none
    shadow="sm"
    bg="neutral-100 dark:neutral-800 focus:neutral-50 dark:focus:neutral-900"
  >
</template>
