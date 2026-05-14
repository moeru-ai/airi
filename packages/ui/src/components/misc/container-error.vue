<script setup lang="ts">
import { errorCauseFrom, errorMessageFrom, errorNameFrom, errorStackFrom } from '@moeru/std'
import { ScrollAreaCorner, ScrollAreaRoot, ScrollAreaScrollbar, ScrollAreaThumb, ScrollAreaViewport } from 'reka-ui'
import { computed, shallowRef } from 'vue'

import Button from './button.vue'

type HeightPreset = 'sm' | 'md' | 'lg' | 'xl' | 'auto'

interface ContainerErrorProps {
  error?: unknown
  message?: string
  stack?: string
  includeStack?: boolean
  showCopyButton?: boolean
  showFeedbackButton?: boolean
  copyButtonLabel?: string
  copiedButtonLabel?: string
  feedbackButtonLabel?: string
  heightPreset?: HeightPreset
}

const props = withDefaults(defineProps<ContainerErrorProps>(), {
  includeStack: true,
  showCopyButton: true,
  showFeedbackButton: true,
  copyButtonLabel: 'Copy',
  copiedButtonLabel: 'Copied',
  feedbackButtonLabel: 'Feedback',
  heightPreset: 'md',
})

const emit = defineEmits<{
  (e: 'copy', content: string): void
  (e: 'feedback'): void
}>()

const copied = shallowRef(false)

const heightPresetClasses: Record<HeightPreset, string[]> = {
  sm: ['h-32'],
  md: ['h-36'],
  lg: ['h-42'],
  xl: ['h-48'],
  auto: [],
}

function indentLines(content: string, indent = 2): string {
  const spaces = ' '.repeat(indent)
  return content
    .split('\n')
    .map(line => `${spaces}${line}`)
    .join('\n')
}

const resolvedErrorName = computed(() => {
  return (errorNameFrom(props.error) ?? '').trim()
})

const resolvedMessage = computed(() => {
  const fromProp = props.message?.trim()
  if (fromProp)
    return fromProp

  const normalizedMessage = errorMessageFrom(props.error)
  if (normalizedMessage)
    return normalizedMessage.trim()

  return props.error == null ? '' : String(props.error).trim()
})

const resolvedStack = computed(() => {
  const fromProp = props.stack?.trim()
  if (fromProp) {
    const index = fromProp.indexOf(resolvedMessage.value)
    if (index >= 0)
      return fromProp.slice(index + resolvedMessage.value.length).trim()
  }

  if (!props.includeStack)
    return ''

  const resolved = (errorStackFrom(props.error) ?? '').trim()
  const index = resolved.indexOf(resolvedMessage.value)
  if (index >= 0)
    return resolved.slice(index + resolvedMessage.value.length).trim()

  return resolved
})

const resolvedCause = computed(() => {
  if (props.error == null)
    return ''

  const cause = errorCauseFrom(props.error)
  if (cause == null)
    return ''

  if (cause instanceof Error) {
    const name = errorNameFrom(cause) ?? cause.name ?? 'Error'
    const message = (errorMessageFrom(cause) ?? cause.message ?? '').trim()
    const stack = (errorStackFrom(cause) ?? cause.stack ?? '').trim()

    const header = message ? `${name}: ${message}` : name
    if (!stack)
      return header

    return `${header}\n${indentLines(stack, 2)}`
  }

  return String(cause).trim()
})

const panelContent = computed(() => {
  const sections: string[] = []

  if (resolvedErrorName.value || resolvedMessage.value) {
    const header = resolvedErrorName.value
      ? (resolvedMessage.value ? `${resolvedErrorName.value}: ${resolvedMessage.value}` : resolvedErrorName.value)
      : resolvedMessage.value
    if (header)
      sections.push(header)
  }

  if (resolvedStack.value)
    sections.push(`Stack:\n${resolvedStack.value}`)

  if (resolvedCause.value)
    sections.push(`Cause:\n${resolvedCause.value}`)

  return sections.join('\n\n')
})

async function copyContent() {
  if (!panelContent.value)
    return

  emit('copy', panelContent.value)

  try {
    const clipboard = globalThis.navigator?.clipboard
    if (!clipboard)
      return

    await clipboard.writeText(panelContent.value)
    copied.value = true
    globalThis.setTimeout(() => {
      copied.value = false
    }, 1200)
  }
  catch {
    // Ignore clipboard failures and still keep emitted copy payload.
  }
}
</script>

<template>
  <div
    :class="[
      'relative w-full rounded-lg bg-red-50/60 dark:bg-red-950/25 backdrop-blur-md p-1',
    ]"
  >
    <div :class="['absolute right-2 -translate-x-full top-2 z-10']">
      <Button
        v-if="showCopyButton"
        size="sm"
        variant="secondary"
        shape="square"
        icon="i-solar:copy-line-duotone"
        :title="copied ? copiedButtonLabel : copyButtonLabel"
        :aria-label="copied ? copiedButtonLabel : copyButtonLabel"
        @click="copyContent"
      />

      <Button
        v-if="showFeedbackButton"
        size="sm"
        variant="secondary"
        shape="square"
        icon="i-solar:square-share-line-line-duotone"
        :title="feedbackButtonLabel"
        :aria-label="feedbackButtonLabel"
        @click="emit('feedback')"
      />
    </div>

    <ScrollAreaRoot
      type="auto"
      :class="[
        'relative w-full overflow-hidden rounded-xl',
        ...heightPresetClasses[heightPreset],
      ]"
    >
      <ScrollAreaViewport :class="['h-full w-full']">
        <div :class="['flex flex-col gap-2 p-3 text-xs']">
          <div v-if="resolvedErrorName || resolvedMessage" :class="['font-mono text-red-700 leading-relaxed dark:text-red-300']">
            {{ resolvedErrorName || 'Error' }}
            <span v-if="resolvedMessage">
              : {{ resolvedMessage }}
            </span>
          </div>
          <pre v-if="resolvedStack" :class="['whitespace-pre-wrap break-words text-neutral-700 leading-relaxed dark:text-neutral-200']">    {{ resolvedStack }}</pre>
          <pre v-if="resolvedCause" :class="['whitespace-pre-wrap break-words text-neutral-700 leading-relaxed dark:text-neutral-200']">{{ `Cause:\n${resolvedCause}` }}</pre>
          <div v-if="!panelContent" :class="['text-neutral-600 dark:text-neutral-300']">
            No error details available.
          </div>
        </div>
      </ScrollAreaViewport>
      <ScrollAreaScrollbar orientation="vertical" :class="['w-2 p-0.5']">
        <ScrollAreaThumb :class="['rounded-full bg-neutral-300/80 dark:bg-neutral-700/80']" />
      </ScrollAreaScrollbar>
      <ScrollAreaCorner />
    </ScrollAreaRoot>
  </div>
</template>
