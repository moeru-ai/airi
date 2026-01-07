<script setup lang="ts">
import { RadioGroupItem, RadioGroupRoot } from 'reka-ui'
import { computed } from 'vue'

interface SelectTabOption {
  label: string
  value: string | number
  description?: string
  icon?: string
}

const props = withDefaults(defineProps<{
  options: SelectTabOption[]
  disabled?: boolean
  readonly?: boolean
  size?: 'sm' | 'md'
}>(), {
  disabled: false,
  readonly: false,
  size: 'md',
})

const modelValue = defineModel<string | number>({ required: true })

const activeIndex = computed(() => props.options.findIndex(option => option.value === modelValue.value))
const itemCount = computed(() => props.options.length || 1)
const isDisabled = computed(() => props.disabled || props.readonly)

const sizeClasses = computed(() =>
  props.size === 'sm'
    ? ['py-2', 'px-3', 'text-xs', 'rounded-md']
    : ['py-2.5', 'px-3.5', 'text-sm', 'rounded-md'],
)

const rootStyle = computed(() => ({
  '--select-tab-count': String(itemCount.value),
  '--select-tab-active-index': String(Math.max(activeIndex.value, 0)),
  '--select-tab-padding': props.size === 'sm' ? '0px' : '0px',
  '--select-tab-gap': '0.25rem',
  '--select-tab-indicator-opacity': activeIndex.value === -1 ? '0' : '1',
}))
</script>

<template>
  <RadioGroupRoot
    v-model="modelValue"
    :disabled="isDisabled"
    :aria-readonly="props.readonly"
    :class="[
      'select-tab',
      'is-interacting',
      'relative', 'flex', 'w-full', 'items-stretch', 'rounded-lg',
      'overflow-hidden',
      'bg-white-400/6', 'dark:bg-neutral-950/70',
      'transition-[border-color,box-shadow,opacity]', 'duration-200', 'ease-out',
      isDisabled ? ['cursor-not-allowed', 'opacity-60'] : ['shadow-[0_14px_50px_-32px_rgba(0,0,0,0.55)]', 'backdrop-blur-sm'],
      // before
      'before:bg-primary-300/50', 'dark:before:bg-primary-400/50',
      'before:rounded-md', 'sm:before:rounded-lg',
      'before:absolute', 'before:z-0', 'before:content-empty',
      'before:transition-[left,width,opacity,background-color]', 'before:duration-200', 'before:ease',
      'before:pointer-events-none',
      'before:opacity-$select-tab-indicator-opacity',
      'before:top-$select-tab-padding',
    ]"
    :style="[
      rootStyle,
      { padding: 'var(--select-tab-padding)', gap: 'var(--select-tab-gap)' },
    ]"
  >
    <RadioGroupItem
      v-for="option in props.options"
      :key="option.value"
      :value="option.value"
      :disabled="isDisabled"
      :aria-label="option.label"
      :class="[
        'select-tab__item',
        'relative', 'z-1',
        'flex', 'flex-1', 'items-center', 'justify-center', 'gap-2',
        'text-center', 'text-neutral-700', 'dark:text-neutral-200', 'font-medium',
        'transition-[color,background-color,border-color,transform]', 'duration-200', 'ease-out',
        'focus-visible:border-none', 'focus-visible:outline-none',
        sizeClasses,
        isDisabled ? 'pointer-events-none' : 'cursor-pointer',
        // checked
        'data-[state=checked]:text-primary-950', 'dark:data-[state=checked]:text-primary-50',
        // unchecked
        'data-[state=unchecked]:hover:bg-primary-300/20', 'dark:data-[state=unchecked]:hover:bg-primary-400/20', 'data-[state=unchecked]:rounded-lg',
      ]"
    >
      <span v-if="option.icon" :class="['size-4 shrink-0 text-current', option.icon]" />
      <span :class="['truncate']">
        {{ option.label }}
      </span>
    </RadioGroupItem>
  </RadioGroupRoot>
</template>

<style scoped>
.select-tab {
  position: relative;
  isolation: isolate;
}

.select-tab::before {
  left:
    calc(
      (100% + var(--select-tab-gap))
      / var(--select-tab-count)
      * var(--select-tab-active-index)
      + var(--select-tab-padding)
    );
  width:
    calc(
      (100% + var(--select-tab-gap))
      / var(--select-tab-count)
      - var(--select-tab-gap)
    );
  height: calc(100% - var(--select-tab-padding) * 2);
}
</style>
