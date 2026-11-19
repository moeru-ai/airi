<script setup lang="ts">
import { errorCauseFrom, errorMessageFrom, errorNameFrom, errorStackFrom } from '@moeru/std'
import { computed, shallowRef } from 'vue'

import ScrollableArea from '../layouts/scrollable-area.vue'
import IconButton from './icon-button.vue'

type HeightPreset = 'sm' | 'md' | 'lg' | 'xl' | 'auto'

interface ContainerErrorProps {
  error?: unknown
  /** Replaces the error name in the title row. The error name then starts the message. */
  title?: string
  /** Short context under the title row, for example the phase that failed. */
  description?: string
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

defineSlots<{
  /** Buttons at the end of the panel, for example a retry action. */
  actions: (props: Record<string, unknown>) => unknown
}>()

const copied = shallowRef(false)

const actionButtonClasses = [
  'size-7 rounded-md',
  'text-red-500 dark:text-red-300',
  'hover:bg-red-500/10 hover:text-red-600 dark:hover:bg-red-400/10 dark:hover:text-red-200',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400',
]

// The preset limits the height of the details area. Short content keeps its natural height.
const heightPresetClasses: Record<HeightPreset, string[]> = {
  sm: ['max-h-32'],
  md: ['max-h-36'],
  lg: ['max-h-42'],
  xl: ['max-h-48'],
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

function stackWithoutMessage(stack: string): string {
  const index = stack.indexOf(resolvedMessage.value)
  const frames = index >= 0 ? stack.slice(index + resolvedMessage.value.length) : stack

  // The stack lines show in their own block, so the engine indentation is not necessary.
  return frames
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n')
}

const resolvedStack = computed(() => {
  const fromProp = props.stack?.trim()
  if (fromProp)
    return stackWithoutMessage(fromProp)

  if (!props.includeStack)
    return ''

  return stackWithoutMessage(errorStackFrom(props.error) ?? '')
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

const displayedMessage = computed(() => {
  if (!props.title || !resolvedErrorName.value)
    return resolvedMessage.value

  return resolvedMessage.value ? `${resolvedErrorName.value}: ${resolvedMessage.value}` : resolvedErrorName.value
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
      'w-full flex flex-col overflow-hidden',
      'rounded-lg',
      'bg-red-50/80 dark:bg-red-950/40 backdrop-blur-md',
    ]"
  >
    <div :class="['flex items-center gap-2', 'py-1.5 pl-3 pr-1.5']">
      <div :class="['i-mingcute:warning-line', 'size-4 shrink-0', 'text-red-500 dark:text-red-300']" />
      <div :class="['min-w-0 flex-1 truncate', 'text-sm font-semibold', 'text-red-600 dark:text-red-300']">
        {{ title || resolvedErrorName || 'Error' }}
      </div>

      <div :class="['flex shrink-0 items-center gap-0.5']">
        <IconButton
          v-if="showCopyButton"
          type="button"
          :icon="copied ? 'i-mingcute:check-line' : 'i-mingcute:copy-2-line'"
          :title="copied ? copiedButtonLabel : copyButtonLabel"
          :aria-label="copied ? copiedButtonLabel : copyButtonLabel"
          :class="actionButtonClasses"
          @click="copyContent"
        />

        <IconButton
          v-if="showFeedbackButton"
          type="button"
          icon="i-mingcute:message-4-line"
          :title="feedbackButtonLabel"
          :aria-label="feedbackButtonLabel"
          :class="actionButtonClasses"
          @click="emit('feedback')"
        />
      </div>
    </div>

    <p
      v-if="description"
      :class="[
        'm-0 -mt-1 px-3 pb-1.5',
        'text-xs',
        'text-neutral-500 dark:text-neutral-400',
      ]"
      v-text="description"
    />

    <ScrollableArea
      :class="['w-full', ...heightPresetClasses[heightPreset]]"
      :viewport-class="['h-full w-full']"
    >
      <div :class="['flex flex-col gap-2', 'px-3 pb-2.5']">
        <p
          v-if="displayedMessage"
          :class="[
            'm-0 whitespace-pre-wrap break-words',
            'text-sm leading-relaxed',
            'text-neutral-800 dark:text-neutral-100',
          ]"
          v-text="displayedMessage"
        />
        <div
          v-if="resolvedStack"
          :class="[
            'flex flex-col',
            'font-mono text-xs leading-relaxed',
            'text-neutral-600 dark:text-neutral-300',
          ]"
        >
          <!-- Each frame starts with an inset, and a wrapped line hangs below the frame text. -->
          <div
            v-for="(frame, index) in resolvedStack.split('\n')"
            :key="index"
            :class="['break-all', 'pl-6 -indent-3']"
          >
            {{ frame }}
          </div>
        </div>
        <pre
          v-if="resolvedCause"
          :class="[
            'm-0 whitespace-pre-wrap break-all',
            'font-mono text-xs leading-relaxed',
            'text-neutral-600 dark:text-neutral-300',
          ]"
        >{{ `Cause:\n${resolvedCause}` }}</pre>
        <p v-if="!panelContent" :class="['m-0 text-sm', 'text-neutral-600 dark:text-neutral-300']">
          No error details available.
        </p>
      </div>
    </ScrollableArea>

    <div v-if="$slots.actions" :class="['flex justify-end gap-2', 'px-3 pb-3']">
      <slot name="actions" />
    </div>
  </div>
</template>
