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
      'text-neutral-900/80 dark:text-neutral-100/80',
      'bg-primary-50/80 dark:bg-primary-900/50 backdrop-blur-md',
      `before:bg-primary-500/30 before:content-[''] before:dark:bg-primary-200/20`,
    ],
    label: [
      'text-primary-500 dark:text-primary-200 font-semibold',
    ],
  },
  lime: {
    container: [
      'text-neutral-900/80 dark:text-neutral-100/80',
      'bg-lime-50/80 dark:bg-lime-900/50 backdrop-blur-md',
      `before:bg-lime-500/30 before:content-[''] before:dark:bg-lime-200/20`,
    ],
    label: [
      'text-lime-500 dark:text-lime-200 font-semibold',
    ],
  },
  violet: {
    container: [
      'text-neutral-900/80 dark:text-neutral-100/80',
      'bg-violet-50/80 dark:bg-violet-900/50 backdrop-blur-md',
      `before:bg-violet-500/30 before:content-[''] before:dark:bg-violet-200/20`,
    ],
    label: [
      'text-violet-500 dark:text-violet-200 font-semibold',
    ],
  },
  orange: {
    container: [
      'text-neutral-900/80 dark:text-neutral-100/80',
      'bg-orange-100/60 dark:bg-orange-900/50 backdrop-blur-md',
      `before:bg-orange-500/30 before:content-[''] before:dark:bg-orange-200/20`,
    ],
    label: [
      'text-orange-500 dark:text-orange-200 font-semibold',
    ],
  },
}
</script>

<template>
  <div
    relative
    flex flex-col gap-1
    rounded-lg
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
