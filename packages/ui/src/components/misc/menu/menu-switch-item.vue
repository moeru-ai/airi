<script setup lang="ts">
import { DropdownMenuCheckboxItem } from 'reka-ui'

import { menuItemClasses } from './classes'

const props = defineProps<{
  disabled?: boolean
}>()

/** The switch state. The whole row toggles it, so the switch itself takes no input. */
const modelValue = defineModel<boolean>({ required: true })
</script>

<template>
  <!-- A toggle keeps the menu open, so the user sees the new state. -->
  <DropdownMenuCheckboxItem v-model="modelValue" :disabled="props.disabled" :class="menuItemClasses" @select.prevent>
    <span :class="['flex-1']">
      <slot />
    </span>
    <span
      aria-hidden="true"
      :class="[
        'relative h-4.5 w-8 shrink-0 rounded-full transition-colors duration-200 motion-reduce:transition-none',
        modelValue ? 'bg-primary-500' : 'bg-neutral-300 dark:bg-neutral-600',
      ]"
    >
      <span
        :class="[
          'absolute top-0.5 size-3.5 rounded-full bg-white shadow transition-transform duration-200 motion-reduce:transition-none',
          modelValue ? 'translate-x-4' : 'translate-x-0.5',
        ]"
      />
    </span>
  </DropdownMenuCheckboxItem>
</template>
