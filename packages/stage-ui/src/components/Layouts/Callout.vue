<script setup lang="ts">
type ThemeVariant = 'primary' | 'violet' | 'lime' | 'orange'

const props = withDefaults(defineProps<{
  theme?: ThemeVariant
  label?: string
}>(), {
  theme: 'primary',
})

const themeClasses: Record<ThemeVariant, {
  container: string[]
  label?: string[]
}> = {
  primary: {
    container: [
      'text-neutral-700/80 dark:text-neutral-300/80',
      'bg-primary-50/60 dark:bg-primary-900/25 backdrop-blur-md',
      `before:bg-primary-200 before:content-[''] before:dark:bg-primary-900`,
    ],
    label: [
      'text-primary-500 dark:text-primary-400 font-semibold',
    ],
  },
  lime: {
    container: [
      'text-neutral-700/80 dark:text-neutral-300/80',
      'bg-lime-50/60 dark:bg-lime-900/25 backdrop-blur-md',
      `before:bg-lime-200 before:content-[''] before:dark:bg-lime-900`,
    ],
    label: [
      'text-lime-500 dark:text-lime-400 font-semibold',
    ],
  },
  violet: {
    container: [
      'text-neutral-700/80 dark:text-neutral-300/80',
      'bg-violet-50/60 dark:bg-violet-900/25 backdrop-blur-md',
      `before:bg-violet-200 before:content-[''] before:dark:bg-violet-900`,
    ],
    label: [
      'text-violet-500 dark:text-violet-400 font-semibold',
    ],
  },
  orange: {
    container: [
      'text-neutral-700/80 dark:text-neutral-300/80',
      'bg-orange-50/70 dark:bg-orange-900/25 backdrop-blur-md',
      `before:bg-orange-200 before:content-[''] before:dark:bg-orange-900`,
    ],
    label: [
      'text-orange-500 dark:text-orange-400 font-semibold',
    ],
  },
}
</script>

<template>
  <div
    relative
    flex flex-col gap-1
    overflow-hidden rounded-lg
    py="2.5" pl="5" pr-3
    :class="[
      ...themeClasses[props.theme || 'violet'].container,
      // eslint-disable-next-line vue/prefer-separate-static-class
      'before-position-absolute before:left-2 before:right-0 before:h-[calc(100%-1rem)] before:top-50% before:translate-y--50% before:w-1 before:rounded-full',
    ]"
  >
    <div text="font-semibold" :class="[...(themeClasses[props.theme || 'violet'].label || [])]">
      <slot name="label">
        {{ props.label || 'Callout' }}
      </slot>
    </div>
    <slot />
  </div>
</template>
