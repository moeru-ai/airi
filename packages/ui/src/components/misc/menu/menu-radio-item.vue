<script setup lang="ts">
import type { DropdownMenuRadioItemEmits, DropdownMenuRadioItemProps } from 'reka-ui'

import { DropdownMenuItemIndicator, DropdownMenuRadioItem, useForwardPropsEmits } from 'reka-ui'

import { menuItemClasses } from './classes'

const props = defineProps<DropdownMenuRadioItemProps>()
const emits = defineEmits<DropdownMenuRadioItemEmits>()
const forwarded = useForwardPropsEmits(props, emits)
</script>

<template>
  <!-- A choice keeps the menu open, so the user sees the new selection. -->
  <DropdownMenuRadioItem
    v-bind="forwarded"
    :class="[menuItemClasses, 'data-[state=checked]:text-primary-600 dark:data-[state=checked]:text-primary-300']"
    @select.prevent
  >
    <slot />
    <DropdownMenuItemIndicator :class="['ml-auto']">
      <span :class="['i-mingcute:check-line size-4 shrink-0']" />
    </DropdownMenuItemIndicator>
  </DropdownMenuRadioItem>
</template>
