<script setup lang="ts">
import { Collapsible } from '@proj-airi/ui'
import { computed } from 'vue'

import { MarkdownRenderer } from '../../markdown'

const props = defineProps<{
  toolName: string
  args: string
}>()

interface TextJournalArgs {
  action?: string
  title?: string
  content?: string
}

const parsedArgs = computed<TextJournalArgs | null>(() => {
  try {
    return JSON.parse(props.args) as TextJournalArgs
  }
  catch {
    return null
  }
})

const isTextJournalCreate = computed(() => {
  return props.toolName === 'text_journal'
    && parsedArgs.value?.action === 'create'
    && !!parsedArgs.value?.content?.trim()
})

const textJournalMarkdown = computed(() => {
  if (!isTextJournalCreate.value)
    return ''

  const title = parsedArgs.value?.title?.trim() || 'Journal Entry'
  const content = parsedArgs.value?.content?.trim() || ''
  return `# ${title}\n\n${content}`
})

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
      'bg-primary-100/40 dark:bg-primary-900/60 rounded-lg px-2 pb-2 pt-2',
      'flex flex-col gap-2 items-start',
    ]"
  >
    <template #trigger="{ visible, setVisible }">
      <button
        :class="[
          'w-full text-start',
        ]"
        @click="setVisible(!visible)"
      >
        <div i-solar:sledgehammer-bold-duotone class="mr-1 inline-block translate-y-1 op-50" />
        <code>{{ toolName }}</code>
      </button>
    </template>
    <div
      :class="[
        'rounded-md p-2 w-full',
        'bg-neutral-100/80 text-sm text-neutral-800 dark:bg-neutral-900/80 dark:text-neutral-200',
      ]"
    >
      <template v-if="isTextJournalCreate">
        <div class="mb-2 flex items-center gap-2">
          <div class="i-solar:notebook-bookmark-bold-duotone text-base text-emerald-500" />
          <div class="rounded-full bg-emerald-500/12 px-2.5 py-1 text-xs text-emerald-700 dark:text-emerald-300">
            Saved to long-term memory
          </div>
        </div>
        <MarkdownRenderer :content="textJournalMarkdown" />
      </template>
      <div v-else class="whitespace-pre-wrap break-words font-mono">
        {{ formattedArgs }}
      </div>
    </div>
  </Collapsible>
</template>
