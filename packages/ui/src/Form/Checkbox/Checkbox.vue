<script setup lang="ts">
import { SwitchRoot, SwitchThumb } from 'reka-ui'

const modelValue = defineModel<boolean>({ required: true })
</script>

<template>
  <SwitchRoot
    v-model="modelValue"
    transition="background duration-250 ease-in-out"
    outline="focus-within:none"
    flex="~"
    border="neutral-300 dark:neutral-700 data-[state=checked]:primary-200 data-[state=unchecked]:neutral-300 focus-within:neutral-800"
    bg="data-[state=checked]:primary-400 data-[state=unchecked]:neutral-300 data-[state=checked]:dark:primary-400/80 dark:data-[state=unchecked]:neutral-800"
    relative h-7 w="12.5" rounded-full
    shadow="sm focus-within:shadow-neutral-800 focus-within:[0_0_0_1px] "
  >
    <SwitchThumb
      my-auto size-6
      flex items-center justify-center
      translate-x="0.5 data-[state=checked]:full"
      rounded-full bg-white text-xs shadow-xl
      transition="transform duration-250 ease-in-out"
      will-change-transform
    />
  </SwitchRoot>
</template>
