<script setup lang="ts">
import type { AssistantMessage, Message } from '@xsai/shared-chat'

import { createWorkflow, workflowEvent } from '@llama-flow/core'
import { withValidation } from '@llama-flow/core/middleware/validation'
import { runWorkflow } from '@llama-flow/core/stream/run'
import { useLocalStorage } from '@vueuse/core'
import { streamText } from '@xsai/stream-text'
import { ref, toRaw } from 'vue'

const baseUrl = useLocalStorage('settings/llm/baseUrl', 'https://openrouter.ai/api/v1/')
const apiKey = useLocalStorage('settings/llm/apiKey', '')
const model = useLocalStorage('settings/llm/model', 'openai/gpt-4o-mini')
const sendingMessage = ref('')
const messages = ref<Message[]>([])
const streamingMessage = ref<AssistantMessage>({ role: 'assistant', content: '' })
const loading = ref(false)

const sendingEvent = workflowEvent<void, 'sending'>()
const tokenEvent = workflowEvent<string, 'token'>()
const textEvent = workflowEvent<string, 'text'>()
const sentenceEvent = workflowEvent<string, 'sentence'>()
const doneEvent = workflowEvent<void, 'done'>()

async function handleChatSendMessage() {
  loading.value = true

  try {
    const streamWorkflow = withValidation(createWorkflow(), [
      [[sendingEvent], [tokenEvent, doneEvent]],
      [[tokenEvent], [textEvent]],
      [[textEvent], [sentenceEvent]],
    ])

    streamWorkflow.handle([sendingEvent], async () => {
      const { sendEvent } = streamWorkflow.createContext()

      streamingMessage.value = { role: 'assistant', content: '' }
      messages.value.push({ role: 'user', content: sendingMessage.value })
      messages.value.push(streamingMessage.value)

      const response = await streamText({
        baseURL: baseUrl.value,
        apiKey: apiKey.value,
        model: model.value,
        messages: messages.value.slice(0, messages.value.length - 1).map(msg => toRaw(msg)),
      })

      for await (const chunk of response.fullStream) {
        if (chunk.type === 'text-delta')
          sendEvent(tokenEvent.with(chunk.text || ''))
      }

      return doneEvent.with()
    })

    streamWorkflow.handle([tokenEvent], async (token) => {
      if (!streamingMessage.value.content)
        streamingMessage.value.content = token.data
      else
        streamingMessage.value.content += token.data
    })

    await runWorkflow(streamWorkflow, sendingEvent.with(), doneEvent)
  }
  catch (err) {
    console.error(err)
  }
  finally {
    loading.value = false
  }
}

// function useMessageTerminationWorkflow(parentWorkflow: WithValidationWorkflow<[[[typeof textEvent], [typeof sentenceEvent]]]>) {
//   let processed = ''

//   parentWorkflow.handle([textEvent], async (sendEvent, text) => {
//     const endMarker = /[.?!]/
//     processed += text.data

//     while (processed) {
//       const endMarkerExecArray = endMarker.exec(processed)
//       if (!endMarkerExecArray || typeof endMarkerExecArray.index === 'undefined')
//         break

//       const before = processed.slice(0, endMarkerExecArray.index + 1)
//       const after = processed.slice(endMarkerExecArray.index + 1)

//       sendEvent(sentenceEvent.with(before))
//       processed = after
//     }
//   })

//   parentWorkflow.handle([doneEvent], async () => {
//     const { sendEvent } = getContext()

//     const content = processed.trim()
//     if (content)
//       sendEvent(sentenceEvent.with(content))

//     processed = ''
//   })
// }
</script>

<template>
  <div flex flex-col gap-2>
    <!-- <h2 text-xl>
      Storage
    </h2> -->
    <div flex="~ col" gap-2>
      <div flex flex-col gap-2>
        <div>
          <span text-neutral-500 dark:text-neutral-400>LLM</span>
        </div>
        <div grid grid-cols-2 gap-2>
          <label flex items-center gap-2>
            <span text-nowrap>
              Base URL
            </span>
            <input
              v-model="baseUrl"
              border="focus:primary-100 dark:focus:primary-400/50 2 solid neutral-200 dark:neutral-800"
              transition="all duration-200 ease-in-out" text="disabled:neutral-400 dark:disabled:neutral-600"
              cursor="disabled:not-allowed" w-full rounded-lg px-2 py-1 text-nowrap text-sm outline-none shadow="sm"
              bg="neutral-100 dark:neutral-800 focus:neutral-50 dark:focus:neutral-900"
            >
          </label>
          <label flex items-center gap-2>
            <span text-nowrap>
              API Key
            </span>
            <input
              v-model="apiKey"
              type="password"
              border="focus:primary-100 dark:focus:primary-400/50 2 solid neutral-200 dark:neutral-800"
              transition="all duration-200 ease-in-out" text="disabled:neutral-400 dark:disabled:neutral-600"
              cursor="disabled:not-allowed" w-full rounded-lg px-2 py-1 text-nowrap text-sm outline-none shadow="sm"
              bg="neutral-100 dark:neutral-800 focus:neutral-50 dark:focus:neutral-900"
            >
          </label>
          <label flex items-center gap-2>
            <span text-nowrap>
              Model
            </span>
            <input
              v-model="model"
              border="focus:primary-100 dark:focus:primary-400/50 2 solid neutral-200 dark:neutral-800"
              transition="all duration-200 ease-in-out" text="disabled:neutral-400 dark:disabled:neutral-600"
              cursor="disabled:not-allowed" w-full rounded-lg px-2 py-1 text-nowrap text-sm outline-none shadow="sm"
              bg="neutral-100 dark:neutral-800 focus:neutral-50 dark:focus:neutral-900"
            >
          </label>
        </div>
      </div>
      <div>
        <textarea
          v-model="sendingMessage"
          border="focus:primary-100 dark:focus:primary-400/50 2 solid neutral-200 dark:neutral-800"
          transition="all duration-200 ease-in-out" text="disabled:neutral-400 dark:disabled:neutral-600"
          cursor="disabled:not-allowed" w-full rounded-lg px-2 py-1 text-nowrap text-sm outline-none shadow="sm"
          bg="neutral-100 dark:neutral-800 focus:neutral-50 dark:focus:neutral-900"
        />
      </div>
      <button rounded-lg bg="blue-100 dark:blue-900" px-4 py-2 @click="handleChatSendMessage">
        Send
      </button>
      <div>
        <div v-for="(message, index) of messages" :key="index">
          <div v-if="message.role === 'user'">
            <span>
              {{ message.content }}
            </span>
          </div>
          <div v-if="message.role === 'assistant'">
            <span>
              {{ message.content }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
