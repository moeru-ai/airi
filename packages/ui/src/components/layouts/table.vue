<script setup lang="ts">
export interface TableProps {
  containerClass?: string | string[]
}

defineOptions({ inheritAttrs: false })
defineProps<TableProps>()
defineSlots<{
  header: () => unknown
  default: () => unknown
}>()
</script>

<template>
  <div :class="['w-full overflow-x-auto', 'border border-neutral-200 rounded-xl dark:border-neutral-800', containerClass]">
    <table v-bind="$attrs" :class="['w-full text-sm']">
      <thead :class="['border-b border-neutral-200 dark:border-neutral-800']">
        <slot name="header" />
      </thead>
      <tbody :class="['divide-y divide-neutral-100 dark:divide-neutral-800/50']">
        <slot />
      </tbody>
    </table>
  </div>
</template>
