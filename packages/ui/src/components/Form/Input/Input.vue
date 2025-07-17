<script setup lang="ts">
const props = defineProps<{
  type?: string
}>()

const modelValue = defineModel<string>({ required: false })
</script>

<template>
  <input
    v-model="modelValue"
    :type="props.type || 'text'"
    border="focus:primary-300 dark:focus:primary-400/50 2 solid neutral-100 dark:neutral-900"
    transition="all duration-200 ease-in-out"
    text="disabled:neutral-400 dark:disabled:neutral-600"
    cursor="disabled:not-allowed"
    w-full rounded-lg px-2 py-1 text-nowrap text-sm outline-none
    shadow="sm"
    bg="neutral-50 dark:neutral-950 focus:neutral-50 dark:focus:neutral-900"
  >
</template>
