<script setup lang="ts">
import type { ToolCallRerunRequest } from '../../../../stores/tool-call-rerun'
import type { ToolCardCall } from '../../../../stores/tool-cards'
import type { ChatSlicesToolCallResult } from '../../../../types/chat'
import type { ToolCallGroupItem, ToolCallState } from './tool-call-group'
import type { ChatToolCallWidgetRegistry } from './tool-call-renderer'

import { TransitionVertical } from '@proj-airi/ui'
import { usePreferredReducedMotion } from '@vueuse/core'
import { animate, createSpring } from 'animejs'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import CardView from '../../../../libs/cards/card-view.vue'
import HitPill from './hit-pill.vue'
import ToolCallPayload from './tool-call-payload.vue'

import { tablerIconMask } from '../../../../libs/tabler-icons'
import { readCallSummary } from '../../../../stores/ai/chat-llm/tool-call-summary'
import { useLlmToolsStore } from '../../../../stores/ai/chat-llm/tools'
import { canRerunToolCall } from '../../../../stores/tool-call-rerun'
import { readToolCardCall, useToolCardsStore } from '../../../../stores/tool-cards'
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
  /** The reply is still being written, so a call that finishes now is new. */
  streaming?: boolean
  /** The id of the reply that holds the calls. */
  messageId?: string
}>()

const emit = defineEmits<{
  (e: 'toolCallRerun', sliceIndex: number, payload: ToolCallRerunRequest): void
}>()

const { t, locale } = useI18n()
const KEY = 'stage.chat.tool-calls'

const llmTools = useLlmToolsStore()
const toolCards = useToolCardsStore()

const calls = computed(() => {
  return props.items.map((item) => {
    // The model says in the call what it does and why, with an icon for it. The row shows both, and a new card of the
    // tool learns from the line.
    const { text: summary, icons } = readCallSummary(item.toolCall.args)
    // The icon draws in the element of the tool icon, so it keeps the size and the color of that icon. The tool icon
    // shows when no candidate leads to an icon.
    const iconMask = tablerIconMask(icons)
    const result = props.resultOf(item.sliceIndex)
    const widget = props.widgets[item.toolCall.toolName]
    const reading = widget?.read(result?.result, item.toolCall.args)
    const title = widget?.title?.(result?.result, item.toolCall.args)
    const state = reading?.failed ? 'error' as const : resolveToolCallBlockState(result)
    // A tool without a widget shows its result on a card. Only a finished call has a result for it. The card store
    // keeps the state of every call in the window, so the call names its message too.
    const read = !widget && state === 'done' ? readToolCardCall(item.toolCall.toolName, item.toolCall.args, result?.result) : undefined
    const cardCall: ToolCardCall | undefined = read && { ...read, callId: `${props.messageId}/${item.key}`, toolName: item.toolCall.toolName, args: item.toolCall.args, summary, locale: locale.value }
    return {
      ...item,
      summary,
      name: title ? t(title.key, title.params ?? {}) : toolDisplayName(item.toolCall.toolName),
      // A widget title already says the state of the call.
      titled: Boolean(title),
      icon: toolIconOf(item.toolCall.toolName, llmTools.tools.findLast(tool => tool.function.name === item.toolCall.toolName)?.icon),
      iconStyle: iconMask ? { '--un-icon': iconMask } : undefined,
      state,
      result: result?.result,
      widget: widget && reading ? { component: widget.component, ...reading } : undefined,
      cardCall,
      card: cardCall ? toolCards.viewOf(cardCall) : undefined,
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
    const { name, titled } = calls.value[0]!
    if (titled)
      return name
    if (value.phase === 'running')
      return t(`${KEY}.running-one`, { name })
    return value.failed ? t(`${KEY}.failed-one`, { name }) : name
  }
  if (value.phase === 'running')
    return t(`${KEY}.combo-running`, { count: value.count })
  return value.failed ? t(`${KEY}.combo-failed`, { count: value.count, failed: value.failed }) : t(`${KEY}.combo`, { count: value.count })
})

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
  // The error icon takes the place of a tool icon, so it comes from the same set.
  return call.state === 'error' ? 'i-tabler:circle-x' : call.icon
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

type ToolCallGroupCall = (typeof calls.value)[number]

// The row then shows the result as it is, and the card store decides on a new card.
function reportBroken(call: ToolCallGroupCall) {
  if (call.cardCall && call.card?.status === 'shown')
    toolCards.reportBroken(call.cardCall, call.card.card.program)
}

// Each row reports what the owner can see of it: a call that finishes while the reply streams, or an unfolded row. The
// card store decides whether that asks for a card.
watch([calls, open, openCalls], () => {
  for (const call of calls.value) {
    if (call.cardCall)
      toolCards.want(call.cardCall, { fresh: props.streaming ?? false, open: open.value && openCalls.value.has(call.key) })
  }
}, { immediate: true })

// The rerun action and the raw data switch. An unfolded row puts the switch under the rerun action, so both are one shape.
const iconButtonClass = [
  'size-6 shrink-0 inline-flex items-center justify-center rounded-lg',
  'outline-none transition-colors duration-200',
  'text-neutral-500 hover:bg-neutral-200/70 hover:text-primary-600',
  'dark:text-neutral-400 dark:hover:bg-neutral-800/80 dark:hover:text-primary-300',
  'focus-visible:ring-2 focus-visible:ring-primary-400/60',
]

const barButtonClass = [
  'shrink-0 inline-flex items-center gap-1 rounded-md px-1.5 py-px text-[11px]',
  'outline-none transition-colors duration-200',
  'text-neutral-500 hover:bg-neutral-200/70 hover:text-primary-600',
  'dark:text-neutral-400 dark:hover:bg-neutral-800/80 dark:hover:text-primary-300',
  'focus-visible:ring-2 focus-visible:ring-primary-400/60',
]

function rerun(item: ToolCallGroupItem) {
  emit('toolCallRerun', item.sliceIndex, {
    toolCallId: item.toolCall.toolCallId,
    toolName: item.toolCall.toolName,
    args: item.toolCall.args,
  })
}
</script>

<template>
  <HitPill v-model:open="open">
    <template #hits="{ hitClass }">
      <TransitionGroup
        tag="span"
        :class="['shrink-0 inline-flex items-center gap-0.5']"
        aria-hidden="true"
        :css="false"
        @enter="popIn"
        @leave="popOut"
      >
        <span v-for="call in visibleHits" :key="call.key" :class="hitClass">
          <!-- A call casts with a spinner. The spinner shrinks away, then the call lands as its own icon with a bounce. -->
          <Transition mode="out-in" :css="false" @enter="popIn" @leave="popOut">
            <span :key="hitIcon(call)" :class="[hitIcon(call), 'text-[11px]']" :style="hitIcon(call) === call.icon ? call.iconStyle : undefined" />
          </Transition>
        </span>
      </TransitionGroup>
      <span v-if="hiddenHits" :class="['shrink-0 text-[10px] tabular-nums', 'text-primary-600 dark:text-primary-300']">+{{ hiddenHits }}</span>
    </template>
    <template #label>
      <span aria-live="polite">
        <Transition :css="false" @enter="popLabelIn">
          <span :key="label" :class="['inline-block origin-left']">{{ label }}</span>
        </Transition>
      </span>
    </template>

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
              <span
                :class="[call.state === 'executing' ? 'i-svg-spinners:ring-resize' : call.icon, 'text-sm', 'text-primary-500 dark:text-primary-300']"
                :style="call.state === 'executing' ? undefined : call.iconStyle"
              />
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
            <!-- The summary names the row, and the unfolded details name the tool. A call without a summary shows the tool name. -->
            <span :class="['min-w-0 flex-1 truncate', 'text-primary-600 dark:text-primary-300']">
              {{ call.summary ?? call.name }}<template v-if="call.summary && call.state === 'executing'">…</template>
            </span>
            <span :class="['sr-only']">{{ t(`${KEY}.state.${call.state}`) }}</span>
          </button>
          <!-- The rerun action shows on every call that a rerun can rebuild, in every state. -->
          <button
            v-if="canRerunToolCall(call.toolCall.toolName)"
            type="button"
            :aria-label="t(`${KEY}.rerun`)"
            :title="t(`${KEY}.rerun`)"
            :class="iconButtonClass"
            @click="rerun(call)"
          >
            <span :class="['i-mingcute:refresh-2-line', 'text-xs']" aria-hidden="true" />
          </button>
        </div>
        <TransitionVertical>
          <div v-if="openCalls.has(call.key)" :class="['flex flex-col gap-2 px-1.5 pb-2 pt-1']">
            <!-- A row with a summary names the tool here, on the line of the actions. Otherwise the row already names it. -->
            <!-- The line reaches the edge of the row above, so its last button ends where the rerun button ends. -->
            <div v-if="call.summary || call.widget || call.card?.status === 'shown'" :class="['flex items-center justify-end gap-1 -me-1.5']">
              <span v-if="call.summary" :class="['me-auto min-w-0 truncate text-[10px]', 'text-neutral-400 dark:text-neutral-500']">{{ call.name }}</span>
              <!-- A card that the owner does not like gets replaced by a new one. A widget of the app has no such action. -->
              <button v-if="call.cardCall && call.card?.status === 'shown'" type="button" :class="barButtonClass" @click="toolCards.remake(call.cardCall)">
                <span :class="['i-mingcute:magic-2-line', 'text-xs']" aria-hidden="true" />
                <span>{{ t(`${KEY}.card-regenerate`) }}</span>
              </button>
              <button
                v-if="call.widget || call.card?.status === 'shown'"
                type="button"
                :aria-label="rawCalls.has(call.key) ? t(`${KEY}.widget`) : t(`${KEY}.raw`)"
                :title="rawCalls.has(call.key) ? t(`${KEY}.widget`) : t(`${KEY}.raw`)"
                :class="iconButtonClass"
                @click="toggleRaw(call.key)"
              >
                <!-- The switch shows the view that it opens: the raw data, or the widget again. -->
                <span :class="[rawCalls.has(call.key) ? 'i-mingcute:layout-4-line' : 'i-mingcute:code-line', 'text-xs']" aria-hidden="true" />
              </button>
            </div>
            <template v-if="call.widget && !rawCalls.has(call.key)">
              <component :is="call.widget.component" v-bind="call.widget.props" />
              <!-- Fields that the widget does not show still appear, so the widget never hides part of the result. -->
              <ToolCallPayload v-if="call.widget.rest !== undefined" :label="t(`${KEY}.other`)" :payload="call.widget.rest" />
            </template>
            <CardView
              v-else-if="call.cardCall && call.card?.status === 'shown' && !rawCalls.has(call.key)"
              :program="call.card.card.program"
              :data="call.cardCall.data"
              @broken="reportBroken(call)"
            />
            <template v-else>
              <div v-if="call.card?.status === 'making'" :class="['flex items-center gap-1.5 text-[11px]', 'text-neutral-500 dark:text-neutral-400']" aria-live="polite">
                <span :class="['i-svg-spinners:ring-resize', 'text-xs', 'text-primary-500 dark:text-primary-300']" aria-hidden="true" />
                <span>{{ call.card.card ? t(`${KEY}.card-remaking`) : t(`${KEY}.card-making`) }}</span>
              </div>
              <div v-else-if="call.cardCall && call.card?.status === 'failed'" :class="['flex items-center gap-1.5 text-[11px]', 'text-neutral-500 dark:text-neutral-400']">
                <span :class="['i-mingcute:close-circle-line', 'text-xs']" aria-hidden="true" />
                <span :class="['min-w-0 flex-1']">{{ t(`${KEY}.card-failed`) }}</span>
                <button type="button" :class="barButtonClass" @click="toolCards.remake(call.cardCall)">
                  <span :class="['i-mingcute:refresh-2-line', 'text-xs']" aria-hidden="true" />
                  <span>{{ t(`${KEY}.card-retry`) }}</span>
                </button>
              </div>
              <ToolCallPayload :label="t(`${KEY}.arguments`)" :payload="call.toolCall.args" />
              <ToolCallPayload :label="t(`${KEY}.result`)" :payload="call.result" />
            </template>
          </div>
        </TransitionVertical>
      </div>
    </TransitionVertical>
  </HitPill>
</template>
