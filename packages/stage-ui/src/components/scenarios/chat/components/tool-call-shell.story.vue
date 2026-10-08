<script setup lang="ts">
import { IconButton } from '@proj-airi/ui'
import { shallowRef } from 'vue'

import ToolCallShell from './tool-call-shell.vue'

const copied = shallowRef(false)
</script>

<template>
  <Story title="Tool Call Shell" group="chat">
    <Variant id="states" title="Executing, done, and error">
      <div :class="['flex flex-col gap-4 p-4']">
        <ToolCallShell v-for="state in ['executing', 'done', 'error'] as const" :key="state" tool-name="search_notes" :state="state">
          <template #labelSuffix>
            <span :class="['ml-2 text-xs opacity-60']">{{ state }}</span>
          </template>
          <template #actions>
            <IconButton icon="i-solar:copy-linear" aria-label="Copy result" @click="copied = true" />
          </template>
          <p>Tool result details appear here.</p>
        </ToolCallShell>
        <p>Copy action: {{ copied }}</p>
      </div>
    </Variant>
  </Story>
</template>
