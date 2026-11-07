<script setup lang="ts" generic="T extends string | number">
import type { SelectTabColor, SelectTabOption, SelectTabRadius } from './types'

import { RadioGroupItem, RadioGroupRoot } from 'reka-ui'
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  options: SelectTabOption<T>[]
  disabled?: boolean
  readonly?: boolean
  size?: 'xs' | 'sm' | 'md'
  tabSpace?: 'compact' | 'spaced'
  /** Controls the corner radius of the track, the thumb, and the items. @default 'lg' */
  radius?: SelectTabRadius
  /** Selects the color family of the track, the thumb, and the items. @default 'primary' */
  color?: SelectTabColor
}>(), {
  disabled: false,
  readonly: false,
  size: 'md',
  tabSpace: 'spaced',
  radius: 'lg',
  color: 'primary',
})

const modelValue = defineModel<T>({ required: true })

const activeIndex = computed(() => props.options.findIndex(option => option.value === modelValue.value))
const itemCount = computed(() => props.options.length || 1)
const isDisabled = computed(() => props.disabled || props.readonly)

const sizeClasses = computed(() =>
  props.size === 'xs'
    ? props.tabSpace === 'compact'
      ? ['py-1', 'px-2', 'text-xs']
      : ['py-1', 'px-2', 'text-xs', 'min-w-20']
    : props.size === 'sm'
      ? props.tabSpace === 'compact'
        ? ['py-2', 'px-3', 'text-xs']
        : ['py-2', 'px-3', 'text-xs', 'min-w-24']
      : props.tabSpace === 'compact'
        ? ['py-2.5', 'px-3.5', 'text-sm']
        : ['py-2.5', 'px-3.5', 'text-sm', 'min-w-32'],
)

const radiusClasses: Record<SelectTabRadius, { track: string, thumb: string[], item: string[] }> = {
  lg: {
    track: 'rounded-lg',
    thumb: ['before:rounded-md', 'sm:before:rounded-lg'],
    item: ['rounded-md', 'data-[state=unchecked]:rounded-lg'],
  },
  xl: {
    track: 'rounded-xl',
    thumb: ['before:rounded-xl'],
    item: ['rounded-xl'],
  },
  full: {
    track: 'rounded-full',
    thumb: ['before:rounded-full'],
    item: ['rounded-full'],
  },
}

const colorClasses: Record<SelectTabColor, { track: string, thumb: string[], item: string[] }> = {
  primary: {
    track: 'bg-neutral-400/6 dark:bg-neutral-950/70',
    thumb: ['before:bg-primary-300/50', 'dark:before:bg-primary-400/50'],
    item: [
      'data-[state=checked]:text-primary-950',
      'dark:data-[state=checked]:text-primary-50',
      'data-[state=unchecked]:hover:bg-primary-300/20',
      'dark:data-[state=unchecked]:hover:bg-primary-400/20',
    ],
  },
  neutral: {
    track: 'bg-neutral-400/10 dark:bg-neutral-800/60',
    thumb: ['before:bg-neutral-300/75', 'dark:before:bg-neutral-700'],
    item: [
      'data-[state=checked]:text-neutral-950',
      'dark:data-[state=checked]:text-white',
      'data-[state=unchecked]:hover:bg-neutral-400/15',
      'dark:data-[state=unchecked]:hover:bg-neutral-500/20',
    ],
  },
}

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
    orientation="horizontal"
    :disabled="isDisabled"
    :aria-readonly="props.readonly"
    :class="[
      'select-tab',
      'is-interacting',
      'relative', 'flex', 'items-stretch',
      radiusClasses[props.radius].track,
      'overflow-hidden',
      colorClasses[props.color].track,
      'transition-[border-color,box-shadow,opacity] duration-200 ease-out',
      isDisabled
        ? ['cursor-not-allowed', 'opacity-60']
        : ['shadow-[0_14px_50px_-32px_rgba(0,0,0,0.55)]', 'backdrop-blur-sm'],
      // before
      colorClasses[props.color].thumb,
      radiusClasses[props.radius].thumb,
      'before:absolute', 'before:z-0', 'before:content-empty',
      'before:transition-[left,width,opacity,background-color]', 'before:duration-200', 'before:ease',
      'before:pointer-events-none',
      'before:opacity-$select-tab-indicator-opacity',
      'before:top-$select-tab-padding',
      'motion-reduce:before:transition-none',
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
        'focus-visible:outline-2 focus-visible:outline-primary-500 focus-visible:outline-offset-[-2px]',
        'motion-reduce:transition-none',
        sizeClasses,
        radiusClasses[props.radius].item,
        isDisabled
          ? 'pointer-events-none'
          : 'cursor-pointer',
        colorClasses[props.color].item,
      ]"
    >
      <span v-if="option.icon" aria-hidden="true" :class="['size-4 shrink-0 text-current', option.icon]" />
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
