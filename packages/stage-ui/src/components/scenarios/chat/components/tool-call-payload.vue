<script setup lang="ts">
import { IconButton } from '@proj-airi/ui'
import { useClipboard, useEventListener, useMutationObserver, useResizeObserver } from '@vueuse/core'
import { computed, reactive, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

import ToolCallPayloadNode from './tool-call-payload-node.vue'

import { formatToolPayload } from './tool-call-group'

/** Tool arguments or a tool result, shown as fields and values the same way for every tool. */
const props = defineProps<{
  label: string
  payload: unknown
}>()

const node = computed(() => formatToolPayload(props.payload))

const { t } = useI18n()
const { copy, copied } = useClipboard({ legacy: true })

// The copy keeps the payload as the tool sent it. A string stays as is, and an object becomes indented JSON.
function copyRaw() {
  void copy(typeof props.payload === 'string' ? props.payload : JSON.stringify(props.payload, null, 2))
}

/**
 * Longest fade at an edge in pixels, about one line of the payload.
 * The content fades itself, so the panel shows through in any theme. A blur layer over the edge showed a lighter box on the translucent panel.
 */
const FADE_LENGTH = 20

const scroller = useTemplateRef<HTMLElement>('scroller')
const fade = reactive({ top: 0, bottom: 0 })

// Each fade grows with the hidden distance on its side and shrinks to nothing at the end of the scroll,
// so an edge never appears or disappears in one step.
function measureFade() {
  const element = scroller.value
  if (!element)
    return
  const hiddenBelow = Math.max(0, element.scrollHeight - element.clientHeight - element.scrollTop)
  fade.top = Math.min(FADE_LENGTH, element.scrollTop)
  fade.bottom = Math.min(FADE_LENGTH, hiddenBelow)
}

useEventListener(scroller, 'scroll', measureFade, { passive: true })
// The box resizes when the window rewraps the text. Inside the fixed height, only a content change shows that a streamed result grew.
useResizeObserver(scroller, measureFade)
useMutationObserver(scroller, measureFade, { childList: true, subtree: true, characterData: true })
</script>

<template>
  <div v-if="node" :class="['flex flex-col gap-1']">
    <div :class="['flex items-center gap-1']">
      <span :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']">{{ props.label }}</span>
      <!-- The icon sits in the slot, so it keeps the label size. The hit area reaches past it, so a finger still lands on it. -->
      <IconButton
        type="button"
        :aria-label="copied ? t('stage.chat.tool-calls.copied') : t('stage.chat.tool-calls.copy')"
        :title="copied ? t('stage.chat.tool-calls.copied') : t('stage.chat.tool-calls.copy')"
        :class="[
          'relative size-5 rounded-md outline-none',
          `after:absolute after:-inset-1.5 after:content-['']`,
          'text-neutral-400 hover:bg-neutral-200/70 hover:text-primary-600',
          'dark:text-neutral-500 dark:hover:bg-neutral-800/80 dark:hover:text-primary-300',
          'focus-visible:ring-2 focus-visible:ring-primary-400/60',
        ]"
        @click="copyRaw"
      >
        <span :class="[copied ? 'i-mingcute:check-line' : 'i-mingcute:copy-2-line', 'block text-xs']" aria-hidden="true" />
      </IconButton>
    </div>
    <!-- The neutral panel of the group frames the details, so a payload has no box of its own. A long one scrolls inside a fixed height, and its content fades out where it goes on. -->
    <div
      ref="scroller"
      :class="[
        'flex flex-col max-h-72 overflow-auto',
        'mask-[linear-gradient(to_bottom,transparent,black_var(--fade-top),black_calc(100%_-_var(--fade-bottom)),transparent)]',
      ]"
      :style="{ '--fade-top': `${fade.top}px`, '--fade-bottom': `${fade.bottom}px` }"
    >
      <ToolCallPayloadNode :node="node" />
    </div>
  </div>
</template>
