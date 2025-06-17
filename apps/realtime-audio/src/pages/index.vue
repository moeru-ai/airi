<script setup lang="ts">
import type { AssistantMessage, Message } from '@xsai/shared-chat'

import type {
  ElevenLabsWebSocketEventAudioOutput,
  ElevenLabsWebSocketEventCloseConnection,
  ElevenLabsWebSocketEventFinalOutput,
  ElevenLabsWebSocketEventInitializeConnection,
  ElevenLabsWebSocketEventSendText,
} from '../types/elevenlabs'

import { useLocalStorage, useWebSocket } from '@vueuse/core'
import { streamText } from '@xsai/stream-text'
import { computed, ref, toRaw, watch } from 'vue'

import { useQueue } from '../composables/queue'

const baseUrl = useLocalStorage('settings/llm/baseUrl', 'https://openrouter.ai/api/v1/')
const apiKey = useLocalStorage('settings/llm/apiKey', '')
const model = useLocalStorage('settings/llm/model', 'openai/gpt-4o-mini')
const sendingMessage = ref('')
const messages = ref<Message[]>([])
const streamingMessage = ref<AssistantMessage>({ role: 'assistant', content: '' })
const audioContext = ref<AudioContext>()

const voiceId = useLocalStorage('settings/voiceId', 'lNxY9WuCBCZCISASyJ55')
const voiceApiKey = useLocalStorage('settings/voiceApiKey', '')
const voiceWsUrl = computed(() => `wss://api.elevenlabs.io/v1/text-to-speech/${voiceId.value}/stream-input`)

const { send, data } = useWebSocket<string>(voiceWsUrl)

function sendPayload<T extends
  | ElevenLabsWebSocketEventInitializeConnection
  | ElevenLabsWebSocketEventSendText
  | ElevenLabsWebSocketEventCloseConnection,
>(payload: T) {
  send(JSON.stringify(payload))
}

async function handleChatSendMessage() {
  if (!audioContext.value) {
    audioContext.value = new AudioContext()
  }

  streamingMessage.value = { role: 'assistant', content: '' }
  messages.value.push({ role: 'user', content: sendingMessage.value })
  messages.value.push(streamingMessage.value)

  const response = await streamText({
    baseURL: baseUrl.value,
    apiKey: apiKey.value,
    model: model.value,
    messages: messages.value.slice(0, messages.value.length - 1).map(msg => toRaw(msg)),
  })

  for await (const chunk of response.chunkStream) {
    const text = chunk.choices[0].delta.content || ''

    if (text !== '') {
      sendPayload({
        'xi-api-key': voiceApiKey.value,
        text,
      })
    }

    streamingMessage.value.content += text
  }

  sendPayload({
    'xi-api-key': voiceApiKey.value,
    'text': '',
  })
}

const audioQueue = useQueue<{ audioBuffer: AudioBuffer }>({
  handlers: [
    (ctx) => {
      return new Promise((resolve) => {
        // Create an AudioBufferSourceNode
        const source = audioContext.value!.createBufferSource()
        source.buffer = ctx.data.audioBuffer

        // Connect the source to the AudioContext's destination (the speakers)
        source.connect(audioContext.value!.destination)

        // Start playing the audio
        source.start(0)
        source.onended = () => {
          resolve()
        }
      })
    },
  ],
})

watch(data, (data) => {
  if (!data)
    return

  const parsedData = JSON.parse(data) as ElevenLabsWebSocketEventAudioOutput | ElevenLabsWebSocketEventFinalOutput

  if (!parsedData)
    return
  if (!('audio' in parsedData))
    return
  if (parsedData.audio == null)
    return
  if (!audioContext.value)
    audioContext.value = new AudioContext()

  const audioBase64 = parsedData.audio

  // Convert base64 to array buffer
  const binaryString = atob(audioBase64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }

  // Decode the audio data and play it
  audioContext.value.decodeAudioData(bytes.buffer, (buffer) => {
    audioQueue.add({ audioBuffer: buffer })
  })
})
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
        <div>
          <span text-neutral-500 dark:text-neutral-400>ElevenLabs</span>
        </div>
        <div grid grid-cols-2 gap-2>
          <label flex items-center gap-2>
            <span text-nowrap>
              Voice ID
            </span>
            <input
              v-model="voiceId"
              border="focus:primary-100 dark:focus:primary-400/50 2 solid neutral-200 dark:neutral-800"
              transition="all duration-200 ease-in-out" text="disabled:neutral-400 dark:disabled:neutral-600"
              cursor="disabled:not-allowed" w-full rounded-lg px-2 py-1 text-nowrap text-sm outline-none shadow="sm"
              bg="neutral-100 dark:neutral-800 focus:neutral-50 dark:focus:neutral-900"
            >
          </label>
          <label flex items-center gap-2>
            <span text-nowrap>
              ElevenLabs API Key
            </span>
            <input
              v-model="voiceApiKey"
              type="password"
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
