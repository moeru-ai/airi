<script setup lang="ts">
import { inject } from 'vue'

const props = defineProps<{
  value: string | number
  label?: string
  active?: boolean
}>()

const selectOption = inject('selectOption') as (value: string | number) => void
const hide = inject('hide') as () => void
</script>

<template>
  <div
    v-bind="{ ...$attrs, class: null, style: null }"
    class="cursor-pointer rounded px-2 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
    :class="{ 'bg-neutral-100 dark:bg-neutral-800': props.active }"
    @click="() => {
      selectOption(props.value)
      hide()
    }"
  >
    <slot>
      {{ props.label }}
    </slot>
  </div>
</template>
