<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { SwitchRoot, SwitchThumb } from 'reka-ui'
import { useData } from 'vitepress'
import { ref, watchPostEffect } from 'vue'

const { isDark } = useData()

const switchTitle = ref('')

watchPostEffect(() => {
  switchTitle.value = isDark.value
    ? 'Switch to light theme'
    : 'Switch to dark theme'
})
</script>

<template>
  <ClientOnly>
    <SwitchRoot
      id="theme-toggle"
      v-model="isDark"
      class="relative h-6 w-11 flex flex-shrink-0 border border-muted-foreground/10 rounded-full bg-muted"
      :aria-label="switchTitle"
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
