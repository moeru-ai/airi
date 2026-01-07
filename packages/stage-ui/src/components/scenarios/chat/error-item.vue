<script setup lang="ts">
import type { ErrorMessage } from '../../../types/chat'

import { computed } from 'vue'

import { MarkdownRenderer } from '../../markdown'

const props = withDefaults(defineProps<{
  message: ErrorMessage
  label: string
  showPlaceholder?: boolean
  variant?: 'desktop' | 'mobile'
}>(), {
  showPlaceholder: false,
  variant: 'desktop',
})

const boxClasses = computed(() => [
  props.variant === 'mobile' ? 'px-2 py-2 text-sm' : 'px-3 py-3',
])
</script>

<template>
  <div flex :class="variant === 'mobile' ? 'mr-0' : 'mr-12'">
    <div
      flex="~ col" shadow="sm violet-200/50 dark:none"
      min-w-20 rounded-xl h="unset <sm:fit"
      class="bg-violet-100/80 dark:bg-violet-950/80"
      :class="boxClasses"
    >
      <div flex="~ row" gap-2>
        <div flex-1 class="inline <sm:hidden">
          <span text-sm text="black/60 dark:white/65" font-normal>{{ label }}</span>
        </div>
        <div i-solar:danger-triangle-bold-duotone text-violet-500 />
      </div>
      <div v-if="showPlaceholder" i-eos-icons:three-dots-loading />
      <MarkdownRenderer
        v-else
        :content="message.content"
        class="break-words text-violet-500 dark:text-violet-300"
      />
    </div>
  </div>
</template>
