<script setup lang="ts">
import type { DropdownMenuItemEmits, DropdownMenuItemProps } from 'reka-ui'

import { DropdownMenuItem, useForwardPropsEmits } from 'reka-ui'

import { menuItemClasses } from './classes'

const props = defineProps<DropdownMenuItemProps>()
const emits = defineEmits<DropdownMenuItemEmits>()
const forwarded = useForwardPropsEmits(props, emits)
</script>

<template>
  <DropdownMenuItem v-bind="forwarded" :class="menuItemClasses">
    <slot />
  </DropdownMenuItem>
</template>
