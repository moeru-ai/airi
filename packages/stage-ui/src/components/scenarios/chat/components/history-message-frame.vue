<script setup lang="ts">
import { useElementVisibility } from '@vueuse/core'
import { computed, inject, useTemplateRef } from 'vue'

import { chatScrollContainerKey } from '../constants'

withDefaults(defineProps<{
  variant?: 'desktop' | 'mobile'
}>(), {
  variant: 'desktop',
})

const messageRef = useTemplateRef<HTMLDivElement>('message')
const injectedScrollContainer = inject(chatScrollContainerKey, undefined)
const scrollTarget = computed(() => injectedScrollContainer?.value ?? null)
const isVisible = useElementVisibility(messageRef, {
  initialValue: false,
  scrollTarget,
})
</script>

<template>
  <div
    ref="message"
    :class="[
      'opacity-0 transition-opacity duration-200 ease-out motion-reduce:transition-none',
      isVisible ? 'opacity-100' : '',
      variant === 'mobile' ? 'pb-1' : 'pb-2',
    ]"
    :data-chat-message-visible="isVisible ? '' : undefined"
  >
    <slot />
  </div>
</template>
