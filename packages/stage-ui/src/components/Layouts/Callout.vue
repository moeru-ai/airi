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
      'bg-primary-400/10 dark:bg-primary-50/10 text-neutral-900/80 backdrop-blur-md',
      `before:bg-primary-400 dark:bg-primary-900/10 dark:text-neutral-100/80 before:content-[''] before:dark:bg-primary-900`,
    ],
    label: [
      'text-primary-500 dark:text-primary-400 font-semibold',
    ],
  },
  lime: {
    container: [
      'bg-lime-400/10 dark:bg-lime-50/10 text-neutral-900/80 backdrop-blur-md',
      `before:bg-lime-400 dark:bg-lime-900/10 dark:text-neutral-100/80 before:content-[''] before:dark:bg-lime-900`,
    ],
    label: [
      'text-lime-500 dark:text-lime-400 font-semibold',
    ],
  },
  violet: {
    container: [
      'bg-violet-400/10 dark:bg-violet-50/10 text-neutral-900/80 backdrop-blur-md',
      `before:bg-violet-400 dark:bg-violet-900/10 dark:text-neutral-100/80 before:content-[''] before:dark:bg-violet-900`,
    ],
    label: [
      'text-violet-500 dark:text-violet-400 font-semibold',
    ],
  },
  orange: {
    container: [
      'bg-orange-400/10 dark:bg-orange-50/10 text-neutral-900/80 backdrop-blur-md',
      `before:bg-orange-400 dark:bg-orange-900/10 dark:text-neutral-100/80 before:content-[''] before:dark:bg-orange-900`,
    ],
    label: [
      'text-orange-500 dark:text-orange-400 font-semibold',
    ],
  },
}
</script>

<template>
  <div
    relative mb-4
    flex flex-col gap-1
    overflow-hidden rounded-lg
    py-2 pl-4 pr-3
    :class="[
      ...themeClasses[props.theme || 'violet'].container,
      // eslint-disable-next-line vue/prefer-separate-static-class
      'before-position-absolute before:inset-0 before:h-full before:w-1 before:rounded-full',
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
