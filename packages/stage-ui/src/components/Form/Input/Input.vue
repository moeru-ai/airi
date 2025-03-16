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
    border="neutral-100 dark:neutral-800 solid 2 focus:neutral-200 dark:focus:neutral-700"
    transition="all duration-250 ease-in-out"
    text="disabled:neutral-400 dark:disabled:neutral-600"
    cursor="disabled:not-allowed"
    w-full rounded-lg px-2 py-1 text-nowrap text-sm outline-none
    shadow="sm"
    bg="neutral-100 dark:neutral-800 focus:neutral-50 dark:focus:neutral-900"
  >
</template>
