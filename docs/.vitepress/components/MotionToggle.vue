<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { useLocalStorage } from '@vueuse/core'
import { SwitchRoot, SwitchThumb } from 'reka-ui'
import { ref, watchPostEffect } from 'vue'

const shouldReduceMotion = useLocalStorage('docs:settings/reduce-motion', false)

const switchTitle = ref('')

watchPostEffect(() => {
  switchTitle.value = shouldReduceMotion.value
    ? 'Enable motion'
    : 'Reduce motion'
})
</script>

<template>
  <ClientOnly>
    <SwitchRoot
      id="motion-toggle"
      v-model="shouldReduceMotion"
      class="border-muted-foreground/10 bg-muted relative h-6 w-11 flex flex-shrink-0 border rounded-full"
      :aria-label="switchTitle"
    >
      <SwitchThumb
        class="bg-background text-muted-foreground border-muted my-auto h-5 w-5 flex translate-x-0.5 items-center justify-center border rounded-full text-xs will-change-transform data-[state=checked]:translate-x-5 !transition-transform"
      >
        <Icon v-if="shouldReduceMotion" icon="lucide:square-dashed-mouse-pointer" />
        <Icon v-else icon="lucide:square-mouse-pointer" />
      </SwitchThumb>
    </SwitchRoot>
  </ClientOnly>
</template>
