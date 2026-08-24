<script setup lang="ts">
import { ChatToolCallShell, createToolResultError, MarkdownRenderer, normalizeToolResultText } from '@proj-airi/stage-ui/components'
import { useJournalPreviewStore } from '@proj-airi/stage-ui/stores/journal-preview'
import { ContainerError } from '@proj-airi/ui'
import { computed } from 'vue'

const props = defineProps<{
  toolName: string
  args: string
  state?: 'executing' | 'done' | 'error'
  result?: unknown
}>()

interface TextJournalArgs {
  action?: string
  title?: string
  content?: string
}

interface ImageJournalArgs {
  action?: string
  prompt?: string
  title?: string
  mode?: 'inline' | 'widget' | 'bg'
}

interface ImageJournalResult {
  imageUrl?: string
}

const { openImagePreview } = useJournalPreviewStore()

function parseObject<T extends object>(value: unknown): T | null {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T
    }
    catch {
      return null
    }
  }

  if (value && typeof value === 'object')
    return value as T

  return null
}

const parsedArgs = computed(() => parseObject<TextJournalArgs & ImageJournalArgs>(props.args))

const isTextJournalCreate = computed(() => {
  return props.toolName === 'text_journal'
    && parsedArgs.value?.action === 'create'
    && !!parsedArgs.value?.content?.trim()
})

const isImageJournalCreate = computed(() => {
  return props.toolName === 'image_journal'
    && parsedArgs.value?.action === 'create'
    && !!parsedArgs.value?.prompt?.trim()
})

const textJournalMarkdown = computed(() => {
  if (!isTextJournalCreate.value)
    return ''

  const title = parsedArgs.value?.title?.trim() || 'Journal Entry'
  const content = parsedArgs.value?.content?.trim() || ''
  return `# ${title}\n\n${content}`
})

const imageJournalMarkdown = computed(() => {
  if (!isImageJournalCreate.value)
    return ''

  const title = parsedArgs.value?.title?.trim() || 'Untitled Image'
  const prompt = parsedArgs.value?.prompt?.trim() || ''
  const mode = parsedArgs.value?.mode || 'inline'

  let footer = ''
  if (mode === 'bg')
    footer = '\n\n> **Scene Shift**: Setting this as the active background...'
  else if (mode === 'widget')
    footer = '\n\n> **Canvas Created**: Spawning an artistry widget for you...'
  else
    footer = '\n\n> **Sharing**: Sending a quick sketch to our chat history...'

  return `### ${title}\n\n*${prompt}*${footer}`
})

const imageJournalResult = computed(() => {
  if (props.toolName !== 'image_journal' || !props.result)
    return null

  return parseObject<ImageJournalResult>(props.result)
})

const resultText = computed(() => normalizeToolResultText(props.result))
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

const imageMode = computed(() => parsedArgs.value?.mode || 'inline')
const imageStatusLabel = computed(() => imageMode.value === 'bg' ? 'Updating Scene' : 'Generating image')
const imageStatusIconClass = computed(() => imageMode.value === 'bg' ? 'i-solar:gallery-wide-bold-duotone text-emerald-500' : 'i-solar:camera-bold-duotone text-violet-500')
const imageStatusBadgeClass = computed(() => {
  return imageMode.value === 'bg'
    ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
    : 'bg-violet-500/12 text-violet-700 dark:text-violet-300'
})

function openGeneratedImagePreview() {
  openImagePreview({
    title: parsedArgs.value?.title || 'Generated Image',
    url: imageJournalResult.value?.imageUrl ?? null,
  })
}
</script>

<template>
  <ChatToolCallShell
    :tool-name="toolName"
    :state="state"
  >
    <template #labelSuffix>
      <span v-if="state === 'error' && resultText" class="ml-2 text-xs text-red-500 op-80">
        (failed)
      </span>
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
    <template v-else-if="isTextJournalCreate">
      <div class="mb-2 flex items-center gap-2">
        <div class="i-solar:notebook-bookmark-bold-duotone text-base text-emerald-500" />
        <div class="rounded-full bg-emerald-500/12 px-2.5 py-1 text-xs text-emerald-700 dark:text-emerald-300">
          Saved to long-term memory
        </div>
      </div>
      <MarkdownRenderer :content="textJournalMarkdown" />
    </template>
    <template v-else-if="isImageJournalCreate">
      <div class="mb-2 flex items-center gap-2">
        <div :class="[imageStatusIconClass, 'text-base']" />
        <div
          :class="[
            'rounded-full px-2.5 py-1 text-xs',
            imageStatusBadgeClass,
          ]"
        >
          {{ imageStatusLabel }}
        </div>
      </div>
      <MarkdownRenderer :content="imageJournalMarkdown" />

      <div
        v-if="imageJournalResult?.imageUrl"
        class="mt-4 overflow-hidden border border-primary-500/20 rounded-xl shadow-lg"
      >
        <img
          :src="imageJournalResult.imageUrl"
          class="w-full cursor-pointer object-contain transition-all active:scale-[0.98] hover:ring-2 hover:ring-primary-500/50"
          @click="openGeneratedImagePreview"
        >
      </div>
    </template>
    <div v-else class="whitespace-pre-wrap break-words font-mono">
      {{ formattedArgs }}
    </div>
  </ChatToolCallShell>
</template>
