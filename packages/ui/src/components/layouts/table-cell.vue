<script setup lang="ts">
export interface TableCellProps {
  align?: 'left' | 'right'
  compact?: boolean
}

defineProps<TableCellProps>()
</script>

<template>
  <td :class="['px-4', compact ? 'py-2' : 'py-3', { 'text-left': align === 'left', 'text-right': align === 'right' }]">
    <slot />
  </td>
</template>
