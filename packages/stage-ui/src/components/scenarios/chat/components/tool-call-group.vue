<script setup lang="ts">
import type { ToolCallRerunRequest } from '../../../../stores/tool-call-rerun'
import type { ChatSlicesToolCallResult } from '../../../../types/chat'
import type { ToolCallGroupItem, ToolCallState } from './tool-call-group'
import type { ChatToolCallWidgetRegistry } from './tool-call-renderer'

import { Collapsible, TransitionVertical } from '@proj-airi/ui'
import { usePreferredReducedMotion } from '@vueuse/core'
import { animate, createSpring } from 'animejs'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ToolCallPayload from './tool-call-payload.vue'

import { useLlmToolsStore } from '../../../../stores/ai/chat-llm/tools'
import { toolIconOf } from '../../../../tools/icons'
import { summarizeToolCallGroup, toolDisplayName } from './tool-call-group'
import { resolveToolCallBlockState } from './tool-call-results'

/**
 * Consecutive generic tool calls of one reply, folded into one pill that reads like a skill combo.
 * Each call lands as a hit in the pill while the reply streams. The pill keeps one height, so the text around it never jumps.
 */
const props = defineProps<{
  items: ToolCallGroupItem[]
  /** Reads the result of the call at a slice index. A call without a result still runs. */
  resultOf: (sliceIndex: number) => ChatSlicesToolCallResult | undefined
  /** Widgets by tool name. An unfolded row shows the widget when the widget can read the result of the call. */
  widgets: ChatToolCallWidgetRegistry
}>()

const emit = defineEmits<{
  (e: 'toolCallRerun', sliceIndex: number, payload: ToolCallRerunRequest): void
}>()

const { t } = useI18n()
const KEY = 'stage.chat.tool-calls'

const llmTools = useLlmToolsStore()

const calls = computed(() => {
  const occurrences = new Map<string, number>()
  return props.items.map((item) => {
    const result = props.resultOf(item.sliceIndex)
    const occurrence = occurrences.get(item.toolCall.toolCallId) ?? 0
    occurrences.set(item.toolCall.toolCallId, occurrence + 1)
    const widget = props.widgets[item.toolCall.toolName]
    const widgetProps = widget?.propsOf(result?.result)
    return {
      ...item,
      // Result slices land between calls while a reply streams, so slice indexes shift. The call id stays.
      // A provider can repeat an id across rounds, so the occurrence keeps the key unique.
      key: `${item.toolCall.toolCallId}#${occurrence}`,
      name: toolDisplayName(item.toolCall.toolName),
      icon: toolIconOf(item.toolCall.toolName, llmTools.tools.findLast(tool => tool.function.name === item.toolCall.toolName)?.icon),
      state: resolveToolCallBlockState(result),
      result: result?.result,
      widget: widget && widgetProps ? { component: widget.component, props: widgetProps } : undefined,
    }
  })
})

/** The pill shows this many hits. Later calls add to a count after them, so the pill stays one line. */
const VISIBLE_HITS = 6
const visibleHits = computed(() => calls.value.slice(0, VISIBLE_HITS))
const hiddenHits = computed(() => Math.max(0, calls.value.length - VISIBLE_HITS))

const summary = computed(() => summarizeToolCallGroup(calls.value.map(call => call.state)))

// One call reads as its own name. Several calls read as a combo, and the count bumps with each new hit.
const label = computed(() => {
  const value = summary.value
  if (value.count === 1) {
    const name = calls.value[0]!.name
    if (value.phase === 'running')
      return t(`${KEY}.running-one`, { name })
    return value.failed ? t(`${KEY}.failed-one`, { name }) : name
  }
  if (value.phase === 'running')
    return t(`${KEY}.combo-running`, { count: value.count })
  return value.failed ? t(`${KEY}.combo-failed`, { count: value.count, failed: value.failed }) : t(`${KEY}.combo`, { count: value.count })
})

const CHIP_SURFACE = ['bg-white/80 text-primary-600 dark:bg-primary-950/60 dark:text-primary-300']

const reducedMotion = usePreferredReducedMotion()
// The spring carries a hit past its full size and lets it wobble back, so it lands with a soft bounce.
const POP_SPRING = createSpring({ bounce: 0.55, duration: 380 })

function popIn(el: Element, done: () => void) {
  if (reducedMotion.value === 'reduce')
    return done()
  animate(el as HTMLElement, { scale: { from: 0 }, rotate: { from: -30 }, opacity: { from: 0 }, ease: POP_SPRING, onComplete: () => done() })
}

/** A finished spinner shrinks away with a small tilt before the tool icon pops in. */
function popOut(el: Element, done: () => void) {
  if (reducedMotion.value === 'reduce')
    return done()
  animate(el as HTMLElement, { scale: 0, rotate: 30, opacity: 0, duration: 160, ease: 'inBack', onComplete: () => done() })
}

/** Text pops without the tilt, so a changing count stays readable. */
function popLabelIn(el: Element, done: () => void) {
  if (reducedMotion.value === 'reduce')
    return done()
  animate(el as HTMLElement, { scale: { from: 0.5 }, opacity: { from: 0 }, ease: POP_SPRING, onComplete: () => done() })
}

function hitIcon(call: { state: ToolCallState, icon: string }) {
  if (call.state === 'executing')
    return 'i-svg-spinners:ring-resize'
  return call.state === 'error' ? 'i-mingcute:close-circle-line' : call.icon
}

/**
 * A finished call marks its tool icon with a small dot. A running call shows a spinner in place of the icon, so it has no dot.
 * The dot color only repeats the state: the row carries the state as text for screen readers and as its hover title.
 */
const STATE_DOTS: Partial<Record<ToolCallState, string>> = {
  done: 'bg-emerald-500',
  error: 'bg-red-500',
}

const open = ref(false)
const openCalls = ref(new Set<string>())
// Rows that exist when the group opens unfold with it. Only a call that arrives while the group is open slides in on its own.
let rowsAtOpen = new Set<string>()
watch(open, (value) => {
  if (value)
    rowsAtOpen = new Set(calls.value.map(call => call.key))
})

function toggleCall(key: string) {
  const next = new Set(openCalls.value)
  if (!next.delete(key))
    next.add(key)
  openCalls.value = next
}

// A row with a widget can switch to the arguments and the result as the tool sent them.
const rawCalls = ref(new Set<string>())

function toggleRaw(key: string) {
  const next = new Set(rawCalls.value)
  if (!next.delete(key))
    next.add(key)
  rawCalls.value = next
}

function rerun(item: ToolCallGroupItem) {
  emit('toolCallRerun', item.sliceIndex, {
    toolCallId: item.toolCall.toolCallId,
    toolName: item.toolCall.toolName,
    args: item.toolCall.args,
  })
}
</script>

<template>
  <!--
    The pill follows the theme color, so it reads as tappable. The unfolded details sit on a neutral panel,
    so they stay apart from the reply text whatever theme color the user picks.
  -->
  <Collapsible v-model="open" :class="['flex flex-col items-start gap-1.5']">
    <template #trigger>
      <button
        type="button"
        :aria-expanded="open"
        :class="[
          'max-w-full inline-flex items-center gap-1.5 rounded-full py-0.5 pl-1 pr-2 text-xs',
          'outline-none transition-colors duration-200',
          'bg-primary-100/70 hover:bg-primary-100 dark:bg-primary-900/50 dark:hover:bg-primary-900/80',
          'text-primary-700 dark:text-primary-100',
          'focus-visible:ring-2 focus-visible:ring-primary-400/60',
        ]"
        @click="open = !open"
      >
        <TransitionGroup
          tag="span"
          :class="['shrink-0 inline-flex items-center gap-0.5']"
          aria-hidden="true"
          :css="false"
          @enter="popIn"
          @leave="popOut"
        >
          <span
            v-for="call in visibleHits"
            :key="call.key"
            :class="['size-4.5 flex items-center justify-center rounded-full', CHIP_SURFACE]"
          >
            <!-- A call casts with a spinner. The spinner shrinks away, then the call lands as its own icon with a bounce. -->
            <Transition mode="out-in" :css="false" @enter="popIn" @leave="popOut">
              <span :key="hitIcon(call)" :class="[hitIcon(call), 'text-[11px]']" />
            </Transition>
          </span>
        </TransitionGroup>
        <span v-if="hiddenHits" :class="['shrink-0 text-[10px] tabular-nums', 'text-primary-600 dark:text-primary-300']">+{{ hiddenHits }}</span>
        <span :class="['min-w-0 truncate font-medium']" aria-live="polite">
          <Transition :css="false" @enter="popLabelIn">
            <span :key="label" :class="['inline-block origin-left']">{{ label }}</span>
          </Transition>
        </span>
        <span
          :class="['i-mingcute:down-line', 'shrink-0 text-xs', 'transition-transform duration-200', open ? 'rotate-180' : '']"
          aria-hidden="true"
        />
      </button>
    </template>

    <div
      :class="[
        'w-full flex flex-col gap-0.5 rounded-xl p-1.5',
        'bg-neutral-100/90 text-neutral-800 dark:bg-neutral-900/80 dark:text-neutral-100',
      ]"
    >
      <TransitionVertical v-for="call in calls" :key="call.key" :appear="!rowsAtOpen.has(call.key)">
        <div>
          <div :class="['flex items-center gap-1']">
            <button
              type="button"
              :aria-expanded="openCalls.has(call.key)"
              :title="t(`${KEY}.state.${call.state}`)"
              :class="[
                'min-w-0 flex flex-1 items-center gap-1.5 rounded-lg px-1.5 py-1 text-start text-xs',
                'outline-none transition-colors duration-200',
                'hover:bg-neutral-200/70 dark:hover:bg-neutral-800/80',
                'focus-visible:ring-2 focus-visible:ring-primary-400/60',
              ]"
              @click="toggleCall(call.key)"
            >
              <span :class="['relative shrink-0 inline-flex']" aria-hidden="true">
                <span :class="[call.state === 'executing' ? 'i-svg-spinners:ring-resize' : call.icon, 'text-sm', 'text-primary-500 dark:text-primary-300']" />
                <!-- The ring takes the panel color, so the dot reads apart from the icon under it. -->
                <span
                  v-if="STATE_DOTS[call.state]"
                  :class="[
                    'absolute -bottom-0.5 -right-0.5 size-1.5 rounded-full',
                    'ring-1.5 ring-neutral-100 dark:ring-neutral-900',
                    STATE_DOTS[call.state],
                  ]"
                />
              </span>
              <span :class="['min-w-0 flex-1 truncate', 'text-primary-600 dark:text-primary-300']">{{ call.name }}</span>
              <span :class="['sr-only']">{{ t(`${KEY}.state.${call.state}`) }}</span>
            </button>
            <!-- The rerun action shows on every call in every state, as it did on the per-call card before. -->
            <button
              type="button"
              :aria-label="t(`${KEY}.rerun`)"
              :title="t(`${KEY}.rerun`)"
              :class="[
                'size-6 shrink-0 inline-flex items-center justify-center rounded-lg',
                'outline-none transition-colors duration-200',
                'text-neutral-500 hover:bg-neutral-200/70 hover:text-primary-600',
                'dark:text-neutral-400 dark:hover:bg-neutral-800/80 dark:hover:text-primary-300',
                'focus-visible:ring-2 focus-visible:ring-primary-400/60',
              ]"
              @click="rerun(call)"
            >
              <span :class="['i-mingcute:refresh-2-line', 'text-xs']" aria-hidden="true" />
            </button>
          </div>
          <TransitionVertical>
            <div v-if="openCalls.has(call.key)" :class="['flex flex-col gap-2 px-1.5 pb-2 pt-1']">
              <div :class="['flex items-center justify-between gap-2']">
                <code :class="['min-w-0 truncate text-[10px]', 'text-neutral-500 dark:text-neutral-400']">{{ call.toolCall.toolName }}</code>
                <button
                  v-if="call.widget"
                  type="button"
                  :class="[
                    'shrink-0 inline-flex items-center gap-1 rounded-md px-1.5 py-px text-[11px]',
                    'outline-none transition-colors duration-200',
                    'text-neutral-500 hover:bg-neutral-200/70 hover:text-primary-600',
                    'dark:text-neutral-400 dark:hover:bg-neutral-800/80 dark:hover:text-primary-300',
                    'focus-visible:ring-2 focus-visible:ring-primary-400/60',
                  ]"
                  @click="toggleRaw(call.key)"
                >
                  <span :class="['i-mingcute:code-line', 'text-xs']" aria-hidden="true" />
                  <span>{{ rawCalls.has(call.key) ? t(`${KEY}.widget`) : t(`${KEY}.raw`) }}</span>
                </button>
              </div>
              <component :is="call.widget.component" v-if="call.widget && !rawCalls.has(call.key)" v-bind="call.widget.props" />
              <template v-else>
                <ToolCallPayload :label="t(`${KEY}.arguments`)" :payload="call.toolCall.args" />
                <ToolCallPayload :label="t(`${KEY}.result`)" :payload="call.result" />
              </template>
            </div>
          </TransitionVertical>
        </div>
      </TransitionVertical>
    </div>
  </Collapsible>
</template>
