<script setup lang="ts">
import { SwitchRoot, SwitchThumb } from 'reka-ui'

const props = defineProps<{
  disabled?: boolean
}>()

const modelValue = defineModel<boolean>({ required: true })
</script>

<template>
  <SwitchRoot
    v-model="modelValue"
    :disabled="props.disabled"
    :class="[
      'duration-250 ease-in-out',
      'focus-within:outline-none',
      'flex',
      'is-interacting',
      'border-neutral-300 dark:border-neutral-700 data-[state=checked]:border-primary-200 data-[state=unchecked]:border-neutral-300 focus-within:border-neutral-800',
      'data-[state=checked]:bg-primary-400 data-[state=unchecked]:bg-neutral-300 data-[state=checked]:dark:bg-primary-400/80 dark:data-[state=unchecked]:bg-neutral-800',
      'data-[state=unchecked]:disabled:bg-neutral-400 data-[state=unchecked]:disabled:dark:bg-neutral-400/80',
      'data-[state=checked]:disabled:bg-primary-400 data-[state=checked]:disabled:dark:bg-primary-400/80',
      'relative h-7 w-12.5 rounded-full',
      'shadow-sm focus-within:shadow-none',
      props.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
    ]"
  >
    <SwitchThumb
      :class="[
        'my-auto size-6',
        'flex items-center justify-center',
        'translate-x-0.5 data-[state=checked]:translate-x-full',
        'rounded-full bg-white text-xs',
        'transition-transform duration-250 ease-in-out',
        'will-change-transform',
      ]"
    />
  </SwitchRoot>
</template>
