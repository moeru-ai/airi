<script setup lang="ts">
import { useElementVisibility } from '@vueuse/core'
import { computed, useTemplateRef } from 'vue'

const props = withDefaults(defineProps<{
  scrollContainer?: HTMLElement | null
  variant?: 'desktop' | 'mobile'
}>(), {
  scrollContainer: null,
  variant: 'desktop',
})

const messageRef = useTemplateRef<HTMLDivElement>('message')
const scrollTarget = computed(() => props.scrollContainer)
const isVisible = useElementVisibility(messageRef, {
  initialValue: false,
  scrollTarget,
})
</script>

<template>
  <div
    ref="message"
    :class="[
      'chat-message-item',
      'opacity-0 transition-opacity duration-200 ease-out motion-reduce:transition-none',
      isVisible ? 'chat-message-item-visible opacity-100' : '',
      variant === 'mobile' ? 'pb-1' : 'pb-2',
    ]"
  >
    <slot />
  </div>
</template>
