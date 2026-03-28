<script setup lang="ts">
const { variant = 'default' } = defineProps<{
  value: string
  variant?: 'default' | 'dotted' | 'active' | 'connector'
  codePoint?: boolean
  invisibleCodePoint?: boolean
}>()
</script>

<template>
  <div flex="~ col items-center gap-1 justify-start items-center">
    <div
      b="~ 2"
      :class="[
        variant === 'active' ? 'b-solid b-primary/50 bg-primary/10 w-10' : '',
        variant === 'dotted' ? 'b-dotted b-primary/20 w-10' : '',
        variant === 'default' ? 'b-dashed b-primary/20 w-10' : '',
        variant === 'connector' ? 'b-transparent bg-transparent' : '',
        'transition-all duration-150 ease-out',
        'h-10 rounded-lg text-lg',
        'flex items-center justify-center',
      ]"
    >
      {{ value }}
    </div>

    <div
      v-if="codePoint || invisibleCodePoint"
      :class="[
        invisibleCodePoint ? 'invisible' : '',
        'text-xs text-primary font-mono',
        'flex flex-col items-center justify-center',
      ]"
    >
      <div v-for="char in value" :key="char">
        {{ char.codePointAt(0)?.toString(16).toUpperCase() }}
      </div>
    </div>
  </div>
</template>
