<script setup lang="ts">
export interface TableHeadProps {
  align?: 'left' | 'right'
}

defineProps<TableHeadProps>()
</script>

<template>
  <th scope="col" :class="['px-4 py-3 font-medium', align === 'right' ? 'text-right' : 'text-left']">
    <slot />
  </th>
</template>
