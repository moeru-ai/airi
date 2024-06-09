<script setup lang="ts">
import { computed, onMounted, ref, watch, watchEffect } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import type { OpenAI } from 'openai'

import Avatar from '../assets/live2d/models/hiyori_free_zh/avatar.png'
import { useLLM } from '../stores/llm'
import { useQueue } from '../composables/queue'
import { useMarkdown } from '../composables/markdown'

import AudioWaveform from './AudioWaveform.vue'
import Live2DViewer from './Live2DViewer.vue'
import BasicTextarea from './BasicTextarea.vue'

interface Message {
  role: 'system' | 'assistant' | 'user'
  content: string
}

const llm = useLLM()
const { audioContext, calculateVolume } = useAudioContext()
const { process } = useMarkdown()

const openAiApiKey = useLocalStorage('openai-api-key', '')
const openAiApiBaseURL = useLocalStorage('openai-api-base-url', 'https://api.openai.com/v1')
const openAIModel = useLocalStorage('openai-model', '')

const audioWaveformRef = ref<{ analyser: () => AnalyserNode }>()

const mouthOpenSize = ref(0)
const supportedModels = ref<OpenAI.Model[]>([])
const messageInput = ref<string>('')
const messages = ref<Message[]>([])
const nowSpeaking = ref(false)
const lipSyncStarted = ref(false)

const model = computed<string>({
  get: () => {
    if (!openAIModel.value)
      return ''

    return (JSON.parse(openAIModel.value) as OpenAI.Model).id
  },
  set: (value) => {
    const found = supportedModels.value.find(m => m.id === value)
    if (!found) {
      openAIModel.value = ''
      return
    }

    openAIModel.value = JSON.stringify(found)
  },
})

const temp = ref<string>('')

const audioQueue = useQueue<{ audioBuffer: AudioBuffer, text: string }>({
  handlers: [
    (ctx) => {
      return new Promise((resolve) => {
        // Create an AudioBufferSourceNode
        const source = audioContext.createBufferSource()
        source.buffer = ctx.data.audioBuffer

        // Connect the source to the AudioContext's destination (the speakers)
        source.connect(audioContext.destination)
        // Connect the source to the analyzer
        source.connect(audioWaveformRef.value!.analyser())

        // Start playing the audio
        nowSpeaking.value = true
        source.start(0)
        source.onended = () => {
          nowSpeaking.value = false
          resolve()
        }
      })
    },
  ],
})

const ttsQueue = useQueue<string>({
  handlers: [
    async (ctx) => {
      const res = await llm.streamSpeech(ctx.data)
      // Decode the ArrayBuffer into an AudioBuffer
      const audioBuffer = await audioContext.decodeAudioData(res)
      audioQueue.add({ audioBuffer, text: ctx.data })
    },
  ],
})

const messageContentQueue = useQueue<string>({
  handlers: [
    async (ctx) => {
      if (ctx.data === '|<llm_inference_end>|') {
        const content = temp.value.trim()
        if (content)
          ttsQueue.add(content)

        temp.value = ''
        return
      }

      const endMarker = ['.', '?', '!']

      let newEndPartDiscovered = false

      for (const marker of endMarker) {
        if (!ctx.data.includes(marker))
          continue

        // find the end of the sentence and push it to the queue with temp
        const periodIndex = ctx.data.indexOf(marker)
        // split
        const beforePeriod = ctx.data.slice(0, periodIndex + 1)
        const afterPeriod = ctx.data.slice(periodIndex + 1)

        temp.value += beforePeriod
        ttsQueue.add(temp.value.trim())
        temp.value = afterPeriod

        newEndPartDiscovered = true
      }

      if (!newEndPartDiscovered)
        temp.value += ctx.data
    },
  ],
})

function getVolumeWithMinMaxNormalizeWithFrameUpdates() {
  requestAnimationFrame(getVolumeWithMinMaxNormalizeWithFrameUpdates)
  if (!nowSpeaking.value)
    return

  mouthOpenSize.value = calculateVolume(audioWaveformRef.value!.analyser(), 'minmax')
}

function setupLipSync() {
  if (!lipSyncStarted.value) {
    getVolumeWithMinMaxNormalizeWithFrameUpdates()
    audioContext.resume()
    lipSyncStarted.value = true
  }
}

function onSendMessage(sendingMessage: string) {
  if (!sendingMessage)
    return

  setupLipSync()

  const message: Message = { role: 'assistant', content: '' }
  messages.value.push({ role: 'user', content: sendingMessage })
  messages.value.push(message)
  const index = messages.value.length - 1

  llm.stream(model.value, messages.value.slice(0, messages.value.length - 1)).then(async (res) => {
    for await (const textPart of res.textStream) {
      messages.value[index].content += textPart
      messageContentQueue.add(textPart)
    }

    messageContentQueue.add('|<llm_inference_end>|')
  })

  messageInput.value = ''
}

watch(openAiApiKey, async (value) => {
  llm.setupOpenAI({
    apiKey: value,
    baseURL: openAiApiBaseURL.value,
  })

  const fetchedModels = await llm.models()
  supportedModels.value = fetchedModels.data
})

onMounted(async () => {
  if (!openAiApiKey.value)
    return

  llm.setupOpenAI({
    apiKey: openAiApiKey.value,
    baseURL: openAiApiBaseURL.value,
  })

  const fetchedModels = await llm.models()
  supportedModels.value = fetchedModels.data
})

onUnmounted(() => {
  lipSyncStarted.value = false
})
</script>

<template>
  <div max-h="[100vh]" h-full p="2" flex="~ col">
    <div space-x="2" flex="~ row" w-full>
      <div flex="~ row" w-full>
        <input
          v-model="openAiApiKey"
          placeholder="Input your API key"
          p="2" bg="zinc-100 dark:zinc-800" w-full rounded-lg outline-none
        >
      </div>
      <div flex="~ row" w-full>
        <input
          v-model="openAiApiBaseURL"
          placeholder="Input your API base URL"
          p="2" bg="zinc-100 dark:zinc-800" w-full rounded-lg outline-none
        >
      </div>
    </div>
    <div flex="~ row 1" w-full items-end space-x-2>
      <div w-full>
        <Live2DViewer :mouth-open-size="mouthOpenSize" />
        <div>
          <input v-model.number="mouthOpenSize" type="range" max="1" min="0" step="0.01">
          <span>{{ mouthOpenSize }}</span>
        </div>
        <AudioWaveform ref="audioWaveformRef" />
      </div>
      <div my="2" w-full space-y-2>
        <div v-for="(message, index) in messages" :key="index">
          <div v-if="message.role === 'assistant'" flex mr="12">
            <div h-10 min-h-10 min-w-10 w-10 overflow-hidden rounded-full border="pink solid 3" mr="2">
              <img :src="Avatar">
            </div>
            <div flex="~ col" bg="pink-50/50 dark:pink-900/50" p="2" border="2 solid pink/10" rounded-lg>
              <div>
                <span font-semibold>Neuro</span>
              </div>
              <div v-html="process(message.content)" />
            </div>
          </div>
          <div v-else-if="message.role === 'user'" flex="~ row-reverse" ml="12">
            <div border="purple solid 3" ml="2" h-10 min-h-10 min-w-10 w-10 overflow-hidden rounded-full>
              <div i-carbon:user-avatar-filled text="purple" h-full w-full p="0" m="0" />
            </div>
            <div flex="~ col" bg="purple-50/50 dark:purple-900/50" p="2" border="2 solid pink/10" rounded-lg>
              <div>
                <span font-semibold>You</span>
              </div>
              <div v-html="process(message.content)" />
            </div>
          </div>
        </div>
      </div>
    </div>
    <div my="2" space-x="2" flex="~ row" w-full self-end>
      <div flex="~ col" w-full space-y="2">
        <select
          v-model="model"
          p="2"
          bg="zinc-100 dark:zinc-800" w-full rounded-lg
          outline-none
        >
          <option value="">
            Select a model
          </option>
          <option v-for="m in supportedModels" :key="m.id" :value="m.id">
            {{ 'name' in m ? `${m.name} (${m.id})` : m.id }}
          </option>
        </select>
        <BasicTextarea
          v-model="messageInput"
          placeholder="Message"
          p="2" bg="zinc-100 dark:zinc-800"
          w-full rounded-lg outline-none
          @submit="onSendMessage"
        />
      </div>
    </div>
  </div>
</template>
