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

import HitPill from './hit-pill.vue'
import ToolCallCard from './tool-call-card.vue'
import ToolCallPayload from './tool-call-payload.vue'

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
}>()

const emit = defineEmits<{
  (e: 'toolCallRerun', sliceIndex: number, payload: ToolCallRerunRequest): void
}>()

const { t, locale } = useI18n()
const KEY = 'stage.chat.tool-calls'

const llmTools = useLlmToolsStore()
const toolCards = useToolCardsStore()

// A card that fails with a result shows that result as it is.
const brokenPrograms = ref<ReadonlySet<string>>(new Set())

const calls = computed(() => {
  const occurrences = new Map<string, number>()
  return props.items.map((item) => {
    const result = props.resultOf(item.sliceIndex)
    const occurrence = occurrences.get(item.toolCall.toolCallId) ?? 0
    occurrences.set(item.toolCall.toolCallId, occurrence + 1)
    const widget = props.widgets[item.toolCall.toolName]
    const reading = widget?.read(result?.result, item.toolCall.args)
    const title = widget?.title?.(result?.result, item.toolCall.args)
    const state = reading?.failed ? 'error' as const : resolveToolCallBlockState(result)
    // A tool without a widget shows a card that a model made for it, while cards are on. Only a finished call has a result for it.
    const cardCall = toolCards.enabled && !widget && state === 'done' ? readToolCardCall(item.toolCall.toolName, item.toolCall.args, result?.result) : undefined
    const card = cardCall ? toolCards.cardsByKey.get(cardCall.key) : undefined
    const cardMaking = cardCall ? toolCards.making.has(cardCall.key) : false
    // A first card that failed offers a try again. A failed new card keeps the old card on show.
    const cardFailed = Boolean(cardCall && !card && !cardMaking && toolCards.failed.has(cardCall.key))
    return {
      ...item,
      // Result slices land between calls while a reply streams, so slice indexes shift. The call id stays.
      // A provider can repeat an id across rounds, so the occurrence keeps the key unique.
      key: `${item.toolCall.toolCallId}#${occurrence}`,
      name: title ? t(title.key, title.params ?? {}) : toolDisplayName(item.toolCall.toolName),
      // A widget title already says the state of the call.
      titled: Boolean(title),
      icon: toolIconOf(item.toolCall.toolName, llmTools.tools.findLast(tool => tool.function.name === item.toolCall.toolName)?.icon),
      state,
      result: result?.result,
      widget: widget && reading ? { component: widget.component, ...reading } : undefined,
      cardCall,
      card,
      cardMaking,
      cardFailed,
      // While a new card is made, the row shows the result as it is, under a line that says so.
      cardShown: Boolean(card && !cardMaking && !brokenPrograms.value.has(card.program)),
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

type ToolCallGroupCall = (typeof calls.value)[number]

function cardCallOf(call: ToolCallGroupCall): ToolCardCall | undefined {
  return call.cardCall && { ...call.cardCall, toolName: call.toolCall.toolName, args: call.toolCall.args, locale: locale.value }
}

// A finished call of a tool without a card asks for one, in a new reply or an old one. Only a row that shows a card
// asks, so a tool with a widget never gets one. Each call asks once. The leader makes each card once for every window.
const askedCalls = new Set<string>()

watch(calls, (current) => {
  for (const call of current) {
    const cardCall = cardCallOf(call)
    if (!cardCall || call.card || call.cardMaking || call.cardFailed || askedCalls.has(call.key))
      continue
    askedCalls.add(call.key)
    toolCards.make(cardCall)
      .catch(error => console.warn('[tool-call-group] Failed to ask for a tool card:', error))
  }
}, { immediate: true })

// A row asks for another card when the owner wants one, tries again, or the card failed with this result.
function remakeCard(call: ToolCallGroupCall) {
  const cardCall = cardCallOf(call)
  if (!cardCall)
    return
  toolCards.remake(cardCall)
    .catch(error => console.warn('[tool-call-group] Failed to ask for a new tool card:', error))
}

// A call whose card fails asks once for a new card. When the new card fails too, the row keeps the result as it is.
const remadeCalls = new Set<string>()

function markBroken(call: ToolCallGroupCall) {
  if (!call.card)
    return
  brokenPrograms.value = new Set(brokenPrograms.value).add(call.card.program)
  if (remadeCalls.has(call.key))
    return
  remadeCalls.add(call.key)
  remakeCard(call)
}

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
            <span :key="hitIcon(call)" :class="[hitIcon(call), 'text-[11px]']" />
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
          <!-- The rerun action shows on every call that a rerun can rebuild, in every state. -->
          <button
            v-if="canRerunToolCall(call.toolCall.toolName)"
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
            <!-- The row above already names the tool, so the details start with the result. -->
            <div v-if="call.widget || call.cardShown" :class="['flex justify-end gap-1']">
              <!-- A card that the owner does not like gets replaced by a new one. A widget of the app has no such action. -->
              <button v-if="call.cardShown" type="button" :class="barButtonClass" @click="remakeCard(call)">
                <span :class="['i-mingcute:magic-2-line', 'text-xs']" aria-hidden="true" />
                <span>{{ t(`${KEY}.card-regenerate`) }}</span>
              </button>
              <button type="button" :class="barButtonClass" @click="toggleRaw(call.key)">
                <span :class="['i-mingcute:code-line', 'text-xs']" aria-hidden="true" />
                <span>{{ rawCalls.has(call.key) ? t(`${KEY}.widget`) : t(`${KEY}.raw`) }}</span>
              </button>
            </div>
            <template v-if="call.widget && !rawCalls.has(call.key)">
              <component :is="call.widget.component" v-bind="call.widget.props" />
              <!-- Fields that the widget does not show still appear, so the widget never hides part of the result. -->
              <ToolCallPayload v-if="call.widget.rest !== undefined" :label="t(`${KEY}.other`)" :payload="call.widget.rest" />
            </template>
            <ToolCallCard
              v-else-if="call.cardShown && call.card && call.cardCall && !rawCalls.has(call.key)"
              :card-key="call.cardCall.key"
              :program="call.card.program"
              :data="call.cardCall.data"
              @broken="markBroken(call)"
            />
            <template v-else>
              <div v-if="call.cardMaking" :class="['flex items-center gap-1.5 text-[11px]', 'text-neutral-500 dark:text-neutral-400']" aria-live="polite">
                <span :class="['i-svg-spinners:ring-resize', 'text-xs', 'text-primary-500 dark:text-primary-300']" aria-hidden="true" />
                <span>{{ call.card ? t(`${KEY}.card-remaking`) : t(`${KEY}.card-making`) }}</span>
              </div>
              <div v-else-if="call.cardFailed" :class="['flex items-center gap-1.5 text-[11px]', 'text-neutral-500 dark:text-neutral-400']">
                <span :class="['i-mingcute:close-circle-line', 'text-xs']" aria-hidden="true" />
                <span :class="['min-w-0 flex-1']">{{ t(`${KEY}.card-failed`) }}</span>
                <button type="button" :class="barButtonClass" @click="remakeCard(call)">
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
