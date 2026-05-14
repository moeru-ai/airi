<script setup lang="ts">
import { Collapsible, ContainerError } from '@proj-airi/ui'
import { computed } from 'vue'

import { createToolResultError } from './tool-call-display'

const props = defineProps<{
  toolName: string
  args: string
  state?: 'executing' | 'done' | 'error'
  result?: unknown
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
</script>

<template>
  <Collapsible
    :class="[
      'bg-primary-100/40 dark:bg-primary-900/60 rounded-lg px-1 pb-1 pt-1',
      'flex flex-col gap-2 items-start',
    ]"
  >
    <template #trigger="{ visible, setVisible }">
      <button
        :class="[
          'w-full text-start',
          'inline-flex items-center',
        ]"
        @click="setVisible(!visible)"
      >
        <div
          v-if="state === 'executing'"
          i-eos-icons:loading class="mr-1 inline-block op-50"
        />
        <div
          v-else-if="state === 'error'"
          i-solar:danger-circle-bold-duotone class="mr-1 inline-block text-red-500"
        />
        <div
          v-else-if="state === 'done'"
          i-solar:check-circle-bold-duotone class="mr-1 inline-block text-emerald-500"
        />
        <div
          v-else
          i-solar:sledgehammer-bold-duotone class="mr-1 inline-block translate-y-1 op-50"
        />
        <code class="text-xs">{{ toolName }}</code>
      </button>
    </template>
    <div
      :class="[
        'rounded-md p-2 w-full',
        'bg-neutral-100/80 text-sm text-neutral-800 dark:bg-neutral-900/80 dark:text-neutral-200',
      ]"
    >
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
    </div>
  </Collapsible>
</template>
