<script setup lang="ts">
import type { ChatAssistantMessage, ChatHistoryItem } from '../../../types/chat'

import { computed, ref } from 'vue'

import ChatHistory from './history.vue'

const markdownMessages = ref<ChatHistoryItem[]>([
  {
    role: 'user',
    content: 'Hey AIRI, can you summarize today\'s tasks?',
  },
  {
    role: 'assistant',
    content: '',
    slices: [
      { type: 'text', text: 'Absolutely! Here is a **quick recap** with bullet points:\n\n- Finish UI polish\n- Ship the API client\n- Record the demo' },
    ],
    tool_results: [],
  },
  {
    role: 'assistant',
    content: '',
    slices: [
      { type: 'tool-call', toolCall: { toolName: 'fetch_tasks', args: JSON.stringify({ limit: 5 }), toolCallId: '1', toolCallType: 'function' } },
      { type: 'text', text: 'Let me pull the latest tasks from the tracker.' },
    ],
    tool_results: [],
  },
])

const toolHeavyMessages = computed<ChatHistoryItem[]>(() => [
  {
    role: 'user',
    content: 'Grab the weather for Tokyo and Osaka.',
  },
  {
    role: 'assistant',
    content: '',
    slices: [
      { type: 'tool-call', toolCall: { toolName: 'weather', args: JSON.stringify({ location: 'Tokyo' }), toolCallId: '2', toolCallType: 'function' } },
      { type: 'tool-call', toolCall: { toolName: 'weather', args: JSON.stringify({ location: 'Osaka' }), toolCallId: '3', toolCallType: 'function' } },
      { type: 'text', text: 'I will fetch both cities, one sec.' },
    ],
    tool_results: [],
  },
])

const errorMessages = ref<ChatHistoryItem[]>([
  {
    role: 'user',
    content: 'Push the deployment now.',
  },
  {
    role: 'error',
    content: 'Deployment failed: upstream gateway timed out. Please try again in a minute.',
  },
])

const streamingMessage = ref<ChatAssistantMessage>({
  role: 'assistant',
  content: '',
  slices: [
    { type: 'text', text: 'Working on it...' },
  ],
  tool_results: [],
})
</script>

<template>
  <Story
    title="Chat / History"
    group="chat"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant
      id="with-tools-desktop"
      title="With Tools"
    >
      <ChatHistory :messages="markdownMessages" />
    </Variant>

    <Variant
      id="with-tools-mobile"
      title="With Tools (Mobile)"
    >
      <ChatHistory
        :messages="markdownMessages"
        variant="mobile"
      />
    </Variant>

    <Variant
      id="multiple-tools"
      title="Multiple Tools"
    >
      <ChatHistory :messages="toolHeavyMessages" />
    </Variant>

    <Variant
      id="streaming"
      title="Streaming"
    >
      <ChatHistory
        :messages="[]"
        :sending="true"
        :streaming-message="streamingMessage"
        variant="mobile"
      />
    </Variant>

    <Variant
      id="error"
      title="Error"
    >
      <ChatHistory
        :messages="errorMessages"
      />
    </Variant>
  </Story>
</template>
