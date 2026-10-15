<script setup lang="ts">
import type { ToolCallRerunRequest } from '../../../../stores/tool-call-rerun'
import type { ChatSlicesToolCallResult } from '../../../../types/chat'
import type { ToolCallGroupItem, ToolCallState } from './tool-call-group'

import { Collapsible, TransitionVertical } from '@proj-airi/ui'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ToolCallPayload from './tool-call-payload.vue'

import { summarizeToolCallGroup, toolDisplayName } from './tool-call-group'
import { resolveToolCallBlockState } from './tool-call-results'

/**
 * Consecutive generic tool calls of one reply, folded into one line.
 * The line keeps one height while calls stream in, and only its title changes, so the text around it never jumps.
 */
const props = defineProps<{
  items: ToolCallGroupItem[]
  /** Reads the result of the call at a slice index. A call without a result still runs. */
  resultOf: (sliceIndex: number) => ChatSlicesToolCallResult | undefined
}>()

const emit = defineEmits<{
  (e: 'toolCallRerun', sliceIndex: number, payload: ToolCallRerunRequest): void
}>()

const { t } = useI18n()
const KEY = 'stage.chat.tool-calls'

const calls = computed(() => props.items.map((item) => {
  const result = props.resultOf(item.sliceIndex)
  return {
    ...item,
    name: toolDisplayName(item.toolCall.toolName),
    state: resolveToolCallBlockState(result) as ToolCallState,
    result: result?.result,
  }
}))

const summary = computed(() => summarizeToolCallGroup(calls.value.map(call => call.state)))

const title = computed(() => {
  const value = summary.value
  if (value.phase === 'running') {
    const name = calls.value[value.current]!.name
    return value.count === 1 ? t(`${KEY}.running-one`, { name }) : t(`${KEY}.running-many`, { index: value.current + 1, name })
  }
  if (value.count === 1)
    return value.failed ? t(`${KEY}.failed-one`, { name: calls.value[0]!.name }) : calls.value[0]!.name
  return value.failed ? t(`${KEY}.settled-many-failed`, { count: value.count, failed: value.failed }) : t(`${KEY}.settled-many`, { count: value.count })
})

// One call shows its raw name for anyone who looks for it. Several calls list their readable names instead.
const subtitle = computed(() => calls.value.length === 1 ? calls.value[0]!.toolCall.toolName : calls.value.map(call => call.name).join(' · '))

const headerIcon = computed(() => {
  if (summary.value.phase === 'running')
    return 'i-eos-icons:loading'
  return summary.value.failed ? 'i-solar:danger-circle-linear' : 'i-solar:sledgehammer-bold-duotone'
})

const STATE_ICONS: Record<ToolCallState, string> = {
  executing: 'i-eos-icons:loading',
  done: 'i-solar:check-circle-linear',
  error: 'i-solar:danger-circle-linear',
}

const open = ref(false)
const openCalls = ref(new Set<number>())
// Rows that exist when the group opens unfold with it. Only a call that arrives while the group is open slides in on its own.
let rowsAtOpen = new Set<number>()
watch(open, (value) => {
  if (value)
    rowsAtOpen = new Set(props.items.map(item => item.sliceIndex))
})

function toggleCall(sliceIndex: number) {
  const next = new Set(openCalls.value)
  if (!next.delete(sliceIndex))
    next.add(sliceIndex)
  openCalls.value = next
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
    The header follows the theme color, so it reads as tappable. The unfolded details sit on a neutral panel,
    so they stay apart from the reply text whatever theme color the user picks.
  -->
  <Collapsible v-model="open" :class="['flex flex-col gap-1.5']">
    <template #trigger>
      <button
        type="button"
        :aria-expanded="open"
        :class="[
          'w-full flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-start',
          'outline-none transition-colors duration-200',
          'bg-primary-100/70 hover:bg-primary-100 dark:bg-primary-900/50 dark:hover:bg-primary-900/80',
          'focus-visible:ring-2 focus-visible:ring-primary-400/60',
        ]"
        @click="open = !open"
      >
        <span
          :class="[
            'size-7 shrink-0 flex items-center justify-center rounded-lg',
            'bg-white/80 text-primary-600 dark:bg-primary-950/60 dark:text-primary-300',
          ]"
          aria-hidden="true"
        >
          <span :class="[headerIcon, 'text-base']" />
        </span>
        <span :class="['min-w-0 flex flex-1 flex-col']">
          <span :class="['relative h-5 overflow-hidden']" aria-live="polite">
            <Transition
              enter-active-class="transition duration-220 ease-out motion-reduce:transition-none"
              enter-from-class="translate-y-full opacity-0"
              leave-active-class="absolute inset-x-0 transition duration-160 ease-in motion-reduce:transition-none"
              leave-to-class="-translate-y-full opacity-0"
            >
              <span :key="title" :class="['block truncate text-sm font-medium', 'text-primary-700 dark:text-primary-100']">{{ title }}</span>
            </Transition>
          </span>
          <span :class="['truncate text-xs', 'text-neutral-500 dark:text-neutral-400', calls.length === 1 ? 'font-mono' : '']">{{ subtitle }}</span>
        </span>
        <span
          :class="['i-solar:alt-arrow-down-linear', 'shrink-0 text-base', 'text-primary-500 dark:text-primary-300', 'transition-transform duration-200', open ? 'rotate-180' : '']"
          aria-hidden="true"
        />
      </button>
    </template>

    <div
      :class="[
        'flex flex-col gap-1 rounded-xl p-2',
        'bg-neutral-100/90 text-neutral-800 dark:bg-neutral-900/80 dark:text-neutral-100',
      ]"
    >
      <TransitionVertical v-for="call in calls" :key="call.sliceIndex" :appear="!rowsAtOpen.has(call.sliceIndex)">
        <div>
          <div :class="['flex items-center gap-1']">
            <button
              type="button"
              :aria-expanded="openCalls.has(call.sliceIndex)"
              :class="[
                'min-w-0 flex flex-1 items-center gap-2 rounded-lg px-1.5 py-1 text-start text-sm',
                'outline-none transition-colors duration-200',
                'hover:bg-neutral-200/70 dark:hover:bg-neutral-800/80',
                'focus-visible:ring-2 focus-visible:ring-primary-400/60',
              ]"
              @click="toggleCall(call.sliceIndex)"
            >
              <span :class="['min-w-0 flex-1 truncate', 'text-primary-600 dark:text-primary-300']">{{ call.name }}</span>
              <span :class="['shrink-0 inline-flex items-center gap-1 text-xs', 'text-neutral-500 dark:text-neutral-400']">
                <span :class="[STATE_ICONS[call.state], 'text-sm']" aria-hidden="true" />
                {{ t(`${KEY}.state.${call.state}`) }}
              </span>
            </button>
            <!-- The rerun action shows on every call in every state, as it did on the per-call card before. -->
            <button
              type="button"
              :aria-label="t(`${KEY}.rerun`)"
              :title="t(`${KEY}.rerun`)"
              :class="[
                'size-7 shrink-0 inline-flex items-center justify-center rounded-lg',
                'outline-none transition-colors duration-200',
                'text-neutral-500 hover:bg-neutral-200/70 hover:text-primary-600',
                'dark:text-neutral-400 dark:hover:bg-neutral-800/80 dark:hover:text-primary-300',
                'focus-visible:ring-2 focus-visible:ring-primary-400/60',
              ]"
              @click="rerun(call)"
            >
              <span :class="['i-solar:refresh-linear', 'text-sm']" aria-hidden="true" />
            </button>
          </div>
          <TransitionVertical>
            <div v-if="openCalls.has(call.sliceIndex)" :class="['flex flex-col gap-2 px-1.5 pb-2 pt-1']">
              <code :class="['truncate text-xs', 'text-neutral-500 dark:text-neutral-400']">{{ call.toolCall.toolName }}</code>
              <ToolCallPayload :label="t(`${KEY}.arguments`)" :payload="call.toolCall.args" />
              <ToolCallPayload :label="t(`${KEY}.result`)" :payload="call.result" />
            </div>
          </TransitionVertical>
        </div>
      </TransitionVertical>
    </div>
  </Collapsible>
</template>
