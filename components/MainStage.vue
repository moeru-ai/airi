<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import type { OpenAI } from 'openai'
import { unified } from 'unified'
import RemarkRehype from 'remark-rehype'
import RemarkParse from 'remark-parse'
import RehypeStringify from 'rehype-stringify'
import { ofetch } from 'ofetch'

import Avatar from '../assets/live2d/models/hiyori_free_zh/avatar.png'
import Live2DViewer from '../components/Live2DViewer.vue'
import BasicTextarea from '../components/BasicTextarea.vue'
import { useLLM } from '../stores/llm'
import { useQueue } from '../composables/queue'
import AudioWaveform from './AudioWaveform.vue'

interface Message {
  role: 'system' | 'assistant' | 'user'
  content: string
}

const llm = useLLM()
const { audioContext } = useAudioContext()

const openAiApiKey = useLocalStorage('openai-api-key', '')
const openAiApiBaseURL = useLocalStorage('openai-api-base-url', 'https://api.openai.com/v1')
const openAIModel = useLocalStorage('openai-model', '')

const mouthOpenSize = ref(0)
const models = ref<OpenAI.Model[]>([])
const input = ref<string>('')
const messages = ref<Message[]>([])
const audioWaveformRef = ref<{ analyser: () => AnalyserNode }>()
const speaking = ref(false)
const speakingLipSyncStarted = ref(false)

const model = computed<string>({
  get: () => {
    if (!openAIModel.value)
      return ''

    return (JSON.parse(openAIModel.value) as OpenAI.Model).id
  },
  set: (value) => {
    const found = models.value.find(m => m.id === value)
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
        speaking.value = true
        source.start(0)
        source.onended = () => {
          speaking.value = false
          resolve()
        }
      })
    },
  ],
})

const ttsQueue = useQueue<string>({
  handlers: [
    async (ctx) => {
      const audioBuffer = await streamSpeech(ctx.data)
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

async function streamSpeech(text: string) {
  const res = await ofetch('/api/v1/llm/voice/text-to-speech', {
    body: {
      text,
    },
    method: 'POST',
    cache: 'no-cache',
    responseType: 'arrayBuffer',
  })

  // Decode the ArrayBuffer into an AudioBuffer
  return await audioContext.decodeAudioData(res)
}

function getVolumeWithLinearNormalize() {
  requestAnimationFrame(getVolumeWithLinearNormalize)
  if (!speaking.value)
    return

  const analyser = audioWaveformRef.value!.analyser()
  const dataBuffer = new Uint8Array(analyser.frequencyBinCount)
  analyser.getByteFrequencyData(dataBuffer)

  const volumeVector = []
  for (let i = 0; i < 700; i += 80)
    volumeVector.push(dataBuffer[i])

  const volumeSum = dataBuffer
    // The volume changes are so flatten, and the volume is so low, so we need to amplify it
    // We can apply a power function to amplify the volume, for example
    // v ** 1.2 will amplify the volume by 1.2 times
    .map(v => v ** 1.2)
    .reduce((acc, cur) => acc + cur, 0)

  mouthOpenSize.value = (volumeSum / dataBuffer.length / 100)
}

function getVolumeWithMinMaxNormalize() {
  requestAnimationFrame(getVolumeWithLinearNormalize)
  if (!speaking.value)
    return

  const analyser = audioWaveformRef.value!.analyser()
  const dataBuffer = new Uint8Array(analyser.frequencyBinCount)
  analyser.getByteFrequencyData(dataBuffer)

  const volumeVector = []
  for (let i = 0; i < 700; i += 80)
    volumeVector.push(dataBuffer[i])

  // The volume changes are so flatten, and the volume is so low, so we need to amplify it
  // We can apply a power function to amplify the volume, for example
  // v ** 1.2 will amplify the volume by 1.2 times
  const amplifiedVolumeVector = dataBuffer.map(v => v ** 1.2)

  // Normalize the amplified values using Min-Max scaling
  const min = Math.min(...amplifiedVolumeVector)
  const max = Math.max(...amplifiedVolumeVector)
  const range = max - min

  let normalizedVolumeVector
  if (range === 0) {
    // If range is zero, all values are the same, so normalization is not needed
    normalizedVolumeVector = amplifiedVolumeVector.map(() => 0) // or any default value
  }
  else {
    normalizedVolumeVector = amplifiedVolumeVector.map(v => (v - min) / range)
  }

  // Aggregate the volume values
  const volumeSum = normalizedVolumeVector.reduce((acc, cur) => acc + cur, 0)

  // Average the volume values
  mouthOpenSize.value = volumeSum / dataBuffer.length
}

function onSendMessage(sendingMessage: string) {
  if (!speakingLipSyncStarted.value) {
    getVolumeWithMinMaxNormalize()
    audioContext.resume()
    speakingLipSyncStarted.value = true
  }

  const message: Message = { role: 'assistant', content: '' }
  messages.value.push({ role: 'user', content: sendingMessage })
  messages.value.push(message)
  const index = messages.value.length - 1
  const textParts: string[] = []

  llm.stream(model.value, sendingMessage).then(async (res) => {
    for await (const textPart of res.textStream) {
      messages.value[index].content += textPart
      messageContentQueue.add(textPart)
      textParts.push(textPart)
    }

    messageContentQueue.add('|<llm_inference_end>|')
  })

  input.value = ''
}

function fromMarkdownToHTML(markdown: string) {
  return unified()
    .use(RemarkParse)
    .use(RemarkRehype)
    .use(RehypeStringify)
    .processSync(markdown)
    .toString()
}

watch(openAiApiKey, (value) => {
  llm.setupOpenAI({
    apiKey: value,
    baseURL: openAiApiBaseURL.value,
  })
})

onMounted(async () => {
  if (!openAiApiKey.value)
    return

  llm.setupOpenAI({
    apiKey: openAiApiKey.value,
    baseURL: openAiApiBaseURL.value,
  })

  const fetchedModels = await llm.models()
  models.value = fetchedModels.data
})

onUnmounted(() => {
  speakingLipSyncStarted.value = false
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
              <div v-html="fromMarkdownToHTML(message.content)" />
            </div>
          </div>
          <div v-else-if="message.role === 'user'" flex="~ row-reverse" ml="12">
            <div border="purple solid 3" ml="2" h-10 min-h-10 min-w-10 w-10 overflow-hidden rounded-full>
              <div i-carbon:user-avatar-filled text="purple" h-full w-full p="0" m="0" />
            </div>
            <div flex="~ col" bg="purple-50/50 dark:purple-900/50" p="2" border="2 solid pink/10" rounded-lg>
              <div self-end>
                <span font-semibold>You</span>
              </div>
              <div v-html="fromMarkdownToHTML(message.content)" />
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
          <option v-for="m in models" :key="m.id" :value="m.id">
            {{ 'name' in m ? `${m.name} (${m.id})` : m.id }}
          </option>
        </select>
        <BasicTextarea
          v-model="input"
          placeholder="Message"
          p="2" bg="zinc-100 dark:zinc-800"
          w-full rounded-lg outline-none
          @submit="onSendMessage"
        />
      </div>
    </div>
  </div>
</template>
