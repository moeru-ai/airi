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
      class="bg-muted border-muted-foreground/10 relative h-6 w-11 flex flex-shrink-0 border rounded-full"
      :aria-label="switchTitle"
    >
      <SwitchThumb
        class="text-muted-foreground border-muted bg-background my-auto h-5 w-5 flex translate-x-0.5 items-center justify-center border rounded-full text-xs will-change-transform data-[state=checked]:translate-x-5 !transition-transform"
      >
        <Icon v-if="isDark" icon="lucide:moon-star" />
        <Icon v-else icon="lucide:sun" />
      </SwitchThumb>
    </SwitchRoot>
  </ClientOnly>
</template>
