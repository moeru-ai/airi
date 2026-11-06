<script setup lang="ts">
import type { ChatSlicesToolCallResult } from '../../../../types/chat'
import type { ToolCallGroupItem } from './tool-call-group'

import ChatToolCallGroup from './tool-call-group.vue'

import { builtinToolCallWidgets } from './tool-call-widgets'

const items: ToolCallGroupItem[] = [
  { sliceIndex: 0, key: 'light#0', toolCall: { toolCallId: 'light', toolCallType: 'function', toolName: 'home_assistant_call_service', args: '{"domain":"light","service":"turn_off","entity_id":"light.bedroom"}' } },
  { sliceIndex: 1, key: 'spark#0', toolCall: { toolCallId: 'spark', toolCallType: 'function', toolName: 'builtIn_emitSparkCommand', args: '{"destinations":["minecraft"],"intent":"action"}' } },
  { sliceIndex: 2, key: 'search#0', toolCall: { toolCallId: 'search', toolCallType: 'function', toolName: 'web_search', args: 'village route' } },
]

const done: Record<number, ChatSlicesToolCallResult> = {
  0: { type: 'tool-call-result', id: 'light', result: '{"ok":true}' },
  1: { type: 'tool-call-result', id: 'spark', result: 'sent' },
  2: { type: 'tool-call-result', id: 'search', result: [{ type: 'text', text: 'Follow the river north.' }] },
}
const failed: Record<number, ChatSlicesToolCallResult> = { ...done, 1: { type: 'tool-call-result', id: 'spark', isError: true, result: 'The module did not respond.' } }
const running: Record<number, ChatSlicesToolCallResult> = { 0: done[0]! }
</script>

<template>
  <Story title="Tool Call Group" group="chat">
    <Variant id="states" title="One call, running, settled, and failed">
      <div :class="['flex max-w-lg flex-col gap-4 p-4']">
        <ChatToolCallGroup :items="items.slice(0, 1)" :result-of="index => done[index]" :widgets="builtinToolCallWidgets" />
        <ChatToolCallGroup :items="items.slice(0, 2)" :result-of="index => running[index]" :widgets="builtinToolCallWidgets" />
        <ChatToolCallGroup :items="items" :result-of="index => done[index]" :widgets="builtinToolCallWidgets" />
        <ChatToolCallGroup :items="items" :result-of="index => failed[index]" :widgets="builtinToolCallWidgets" />
      </div>
    </Variant>
  </Story>
</template>
