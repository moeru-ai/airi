<script setup lang="ts">
import { ContainerError } from '@proj-airi/ui'
import { computed } from 'vue'

import ChatToolCallShell from './tool-call-shell.vue'

import { createToolResultError } from './tool-call-display'

const props = defineProps<{
  toolCallId: string
  toolName: string
  args: string
  state?: 'executing' | 'done' | 'error'
  result?: unknown
}>()

const emit = defineEmits<{
  (e: 'toolCallRerun', payload: { toolCallId: string, toolName: string, args: string }): void
}>()

const resultError = computed(() => props.state === 'error' ? createToolResultError(props.result) : undefined)

const formattedArgs = computed(() => {
  try {
    const parsed = JSON.parse(props.args)
    return JSON.stringify(parsed, null, 2).trim()
  }
  catch {
    return props.args
  }
})

function emitToolCallRerun() {
  emit('toolCallRerun', {
    toolCallId: props.toolCallId,
    toolName: props.toolName,
    args: props.args,
  })
}
</script>

<template>
  <ChatToolCallShell
    :tool-name="toolName"
    :state="state"
  >
    <template #actions>
      <button
        aria-label="Re-run tool call"
        :class="[
          'h-6 w-6 shrink-0 rounded-md',
          'inline-flex items-center justify-center',
          'text-primary-700/70 hover:bg-primary-200/70 hover:text-primary-800',
          'dark:text-primary-100/70 dark:hover:bg-primary-800/70 dark:hover:text-primary-50',
        ]"
        @click.stop="emitToolCallRerun"
      >
        <div class="i-solar:refresh-bold text-sm" />
      </button>
    </template>

    <template v-if="resultError">
      <ContainerError
        :error="resultError"
        :include-stack="false"
        :show-feedback-button="false"
        height-preset="auto"
      />
      <div
        :class="[
          'mt-2 whitespace-pre-wrap break-words font-mono',
        ]"
      >
        {{ formattedArgs }}
      </div>
    </template>
    <div v-else class="whitespace-pre-wrap break-words font-mono">
      {{ formattedArgs }}
    </div>
  </ChatToolCallShell>
</template>
