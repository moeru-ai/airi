<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { SwitchRoot, SwitchThumb } from 'reka-ui'
import { useData } from 'vitepress'
import { ref, watchPostEffect } from 'vue'

defineOptions({
  // DropdownMenuItem as-child passes item attrs here; ClientOnly (fragment)
  // can't inherit them, so bind $attrs onto SwitchRoot manually.
  inheritAttrs: false,
})

const { isDark } = useData()

const switchTitle = ref('')

watchPostEffect(() => {
  switchTitle.value = isDark.value
    ? 'Switch to light theme'
    : 'Switch to dark theme'
})

/**
 * Wraps the theme switch in a View Transition so the browser cross-fades the
 * whole page snapshots, keeping every element in sync. Falls back to an
 * instant switch where `startViewTransition` is unsupported (e.g. older
 * Firefox) or the user prefers reduced motion.
 */
function onToggle(value: boolean) {
  if (value === isDark.value)
    return
  const prefersReducedMotion = typeof matchMedia !== 'undefined'
    && matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!prefersReducedMotion && typeof document !== 'undefined' && 'startViewTransition' in document) {
    document.startViewTransition(() => {
      isDark.value = value
    })
  }
  else {
    isDark.value = value
  }
}
</script>

<template>
  <ClientOnly>
    <SwitchRoot
      id="theme-toggle"
      v-bind="$attrs"
      :model-value="isDark"
      class="relative h-6 w-11 flex flex-shrink-0 border border-muted-foreground/10 rounded-full bg-muted"
      :aria-label="switchTitle"
      @update:model-value="onToggle"
    >
      <SwitchThumb
        class="my-auto h-5 w-5 flex translate-x-0.5 items-center justify-center border border-muted rounded-full bg-background text-xs text-muted-foreground will-change-transform data-[state=checked]:translate-x-5 !transition-transform"
      >
        <Icon v-if="isDark" icon="lucide:moon-star" />
        <Icon v-else icon="lucide:sun" />
      </SwitchThumb>
    </SwitchRoot>
  </ClientOnly>
</template>
