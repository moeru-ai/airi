<script setup lang="ts">
import { DropdownMenuLabel } from 'reka-ui'
</script>

<template>
  <DropdownMenuLabel :class="['px-3 pb-1 pt-2 text-xs text-neutral-500 dark:text-neutral-400']">
    <slot />
  </DropdownMenuLabel>
</template>
