<script setup lang="ts">
import { computed } from 'vue'

type ThemeVariant = 'primary' | 'violet' | 'lime' | 'orange'

export interface TabItem {
  value: string
  label: string
  icon?: string | { active: string, idle: string }
  disabled?: boolean
}

const props = withDefaults(defineProps<{
  modelValue: string
  tabs: TabItem[]
  theme?: ThemeVariant
  size?: 'xs' | 'sm' | 'md'
  label?: string
}>(), {
  theme: 'primary',
  size: 'sm',
})

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'change', v: string): void
}>()

const commonThemeClasses = {
  tabActive: [
    'bg-white shadow-sm font-bold text-primary-600 dark:text-primary-400 text-xs',
    'ring-2 ring-primary-500',
    'dark:bg-neutral-700',
    'ring-1 ring-black/5 dark:ring-white/10',
  ],
  tabIdle: [
    'text-neutral-600 hover:bg-white/70',
    'dark:text-neutral-300 dark:hover:bg-white/10',
    'text-xs',
  ],
}

const themeClasses: Record<ThemeVariant, {
  container: string[]
  tabActive: string[]
  tabIdle: string[]
  label?: string[]
}> = {
  primary: {
    container: [
      'bg-primary-50/60 dark:bg-primary-900/25 backdrop-blur-md',
      'text-neutral-700/80 dark:text-neutral-300/80',
    ],
    label: ['text-primary-500 dark:text-primary-400 font-semibold'],
    ...commonThemeClasses,
  },
  violet: {
    container: [
      'bg-violet-50/60 dark:bg-violet-900/25 backdrop-blur-md',
      'text-neutral-700/80 dark:text-neutral-300/80',
    ],
    label: ['text-violet-500 dark:text-violet-400 font-semibold'],
    ...commonThemeClasses,
  },
  lime: {
    container: [
      'bg-lime-50/60 dark:bg-lime-900/25 backdrop-blur-md',
      'text-neutral-700/80 dark:text-neutral-300/80',
    ],
    label: ['text-lime-500 dark:text-lime-400 font-semibold'],
    ...commonThemeClasses,
  },
  orange: {
    container: [
      'bg-orange-50/70 dark:bg-orange-900/25 backdrop-blur-md',
      'text-neutral-700/80 dark:text-neutral-300/80',
    ],
    label: ['text-orange-500 dark:text-orange-400 font-semibold'],
    ...commonThemeClasses,
  },
}

const sizeCls = computed(() => ({
  xs: 'px-2 py-1 text-xs',
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
})[props.size])

function onClick(v: string, disabled?: boolean) {
  if (disabled)
    return
  if (v === props.modelValue)
    return
  emit('update:modelValue', v)
  emit('change', v)
}
</script>

<template>
  <div
    class="relative overflow-hidden rounded-lg p-2"
    :class="themeClasses[theme].container"
  >
    <div v-if="label" class="mb-1 text-sm" :class="themeClasses[theme].label">
      {{ label }}
    </div>
    <div class="flex select-none items-center gap-1" role="tablist">
      <button
        v-for="t in tabs"
        :key="t.value"
        type="button"
        role="tab"
        :aria-selected="modelValue === t.value"
        :disabled="t.disabled"
        :class="[
          'inline-flex items-center gap-1 rounded-md transition-all',
          sizeCls,
          t.disabled ? 'opacity-40 cursor-not-allowed' : '',
          modelValue === t.value ? themeClasses[theme].tabActive : themeClasses[theme].tabIdle,
          'focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-primary-200 focus-visible:outline-offset-2',
        ]"
        @click="onClick(t.value, t.disabled)"
      >
        <span
          v-if="t.icon"
          :class="[
            typeof t.icon === 'string'
              ? t.icon
              : (t.value === modelValue ? t.icon.active : t.icon.idle),
            'text-base',
          ]"
        />
        <span class="whitespace-nowrap">{{ t.label }}</span>
      </button>
    </div>

    <!-- Content -->
    <div class="mt-2">
      <!-- Pass active value to consumer -->
      <slot name="default" :active="modelValue" />
    </div>
  </div>
</template>
