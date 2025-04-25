<script setup lang="ts">
import BasicTextarea from './Basic.vue'

const modelValue = defineModel<string>({ default: '' })
</script>

<template>
  <BasicTextarea
    v-model="modelValue"
    border="neutral-100 dark:neutral-800 solid 2 focus:neutral-200 dark:focus:neutral-700"
    transition="all duration-250 ease-in-out"
    bg="neutral-100 dark:neutral-800 focus:neutral-50 dark:focus:neutral-900"
    rounded-lg px-3 py-2 text-sm outline-none
  />
</template>
