<script setup lang="ts">
const { variant = 'default' } = defineProps<{
  value: string
  variant?: 'default' | 'active' | 'connector'
  codePoint?: boolean
  invisibleCodePoint?: boolean
}>()
</script>

<template>
  <div flex="~ col items-center gap-1 justify-center">
    <div
      b="~ 2"
      :class="{
        'b-solid b-primary/50 bg-primary/10 w-10': variant === 'active',
        'b-dashed b-primary/20 w-10': variant === 'default',
        'b-transparent bg-transparent': variant === 'connector',
      }"
      h-10 rounded-lg text-lg
      flex="~ items-center justify-center"
      transition="~ all duration-150 ease-out"
    >
      {{ value }}
    </div>

    <div v-if="codePoint || invisibleCodePoint" text-xs text="primary" font-mono :class="{ invisible: invisibleCodePoint }">
      {{ value.codePointAt(0)?.toString(16).toUpperCase() }}
    </div>
  </div>
</template>
