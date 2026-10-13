<script setup lang="ts">
import type { ConversationMessage, ConversationTerm } from '@proj-airi/stage-ui/libs/voice/transcription-bias'

import { SHERPAW_TRANSCRIPTION_PROVIDER_ID, sherpawModels } from '@proj-airi/provider-inference'
import { conversationMessagesOf, rankConversationTerms, TranscriptionBiasList } from '@proj-airi/stage-ui/libs/voice/transcription-bias'
import { describeBiasDelivery } from '@proj-airi/stage-ui/libs/voice/transcription-bias-delivery'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { Button, FieldInputFile, FieldSelect, FieldTextArea } from '@proj-airi/ui'
import { useObjectUrl } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, shallowRef, watch } from 'vue'

import { useBiasComparison, useClipRecorder } from './composables/use-bias-comparison'

const sourceOptions = [
  { value: 'session', label: 'Saved chat' },
  { value: 'text', label: 'Pasted conversation' },
]
const formLabels: Record<ConversationTerm['form'] | 'extra', string> = {
  quoted: 'quoted span',
  identifier: 'identifier',
  name: 'capitalized name',
  extra: 'extra source',
}

const sessions = useChatSessionStore()
const { sessionMetas, activeSessionId } = storeToRefs(sessions)
const { userId } = storeToRefs(useAuthStore())
const hearing = useHearingStore()
const providers = useProviderStore()
const providerConfigs = useProviderConfigStore()

const source = shallowRef<'session' | 'text'>('session')
const pasted = shallowRef('user: I built a store with Zustand and React.js.\nassistant: Zustand works well. Did you meet the Sulfur Cube, 「硫方怪」, in Minecraft?')
const extra = shallowRef('')
const sessionMessages = shallowRef<readonly ConversationMessage[]>([])
const sessionError = shallowRef<string>()

/** The signed-in user's chats, newest first, as the sessions drawer lists them. */
const sessionOptions = computed(() => {
  const owner = userId.value || 'local'
  return Object.values(sessionMetas.value)
    .filter(meta => meta.userId === owner)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(meta => ({
      value: meta.sessionId,
      label: `${meta.title || 'Untitled chat'} (${new Date(meta.updatedAt).toLocaleString()})${meta.sessionId === activeSessionId.value ? ' - active' : ''}`,
    }))
})
const selectedSessionId = shallowRef('')
// The selection falls back to the active chat when it is empty or leaves the list, for example after an account switch.
watch([activeSessionId, sessionOptions], ([sessionId, options]) => {
  if (!options.some(option => option.value === selectedSessionId.value))
    selectedSessionId.value = options.some(option => option.value === sessionId) ? sessionId : ''
}, { immediate: true })

async function loadSelectedSession() {
  sessionError.value = undefined
  const sessionId = selectedSessionId.value
  if (!sessionId) {
    sessionError.value = 'No chat is selected.'
    sessionMessages.value = []
    return
  }
  let loaded: boolean
  try {
    loaded = await sessions.loadSession(sessionId)
  }
  catch (cause) {
    loaded = false
    console.warn('[transcription-bias] Chat load failed', cause)
  }
  // The selection can change while the session loads. Only the latest selection writes the messages.
  if (sessionId !== selectedSessionId.value)
    return
  const stored = loaded ? sessions.getSessionMessagesIfLoaded(sessionId) : undefined
  if (!stored)
    sessionError.value = 'The chat did not load.'
  sessionMessages.value = conversationMessagesOf(stored ?? [])
}
watch(selectedSessionId, () => void loadSelectedSession(), { immediate: true })

/** Lines start with `user:` or `assistant:`. A line without a role continues the previous message. */
function parseConversation(text: string): ConversationMessage[] {
  const messages: { role: string, text: string }[] = []
  for (const line of text.split('\n')) {
    const match = /^\s*(user|assistant|system)\s*:(.*)$/i.exec(line)
    if (match)
      messages.push({ role: match[1].toLowerCase(), text: match[2].trim() })
    else if (messages.length)
      messages[messages.length - 1].text += `\n${line}`
    else if (line.trim())
      messages.push({ role: 'user', text: line })
  }
  return messages
}

const messages = computed(() => source.value === 'session' ? sessionMessages.value : parseConversation(pasted.value))
const terms = computed(() => rankConversationTerms(messages.value))
const extraPhrases = computed(() => extra.value.split('\n').map(line => line.trim()).filter(Boolean))

/** The merged list, built by the same class as the voice store, with the extra phrases as a second source. */
const bias = shallowRef<readonly string[]>([])
watch([terms, extraPhrases], async ([currentTerms, currentExtra]) => {
  const list = new TranscriptionBiasList([
    { name: 'conversation', collect: async () => currentTerms.map(term => term.phrase) },
    { name: 'extra', collect: async () => currentExtra },
  ])
  await list.rebuild('devtool')
  bias.value = list.read('devtool')?.phrases ?? []
}, { immediate: true })

const rows = computed(() => {
  const ranked = new Map(terms.value.map(term => [term.phrase.toLocaleLowerCase(), term]))
  return bias.value.map((phrase) => {
    const term = ranked.get(phrase.toLocaleLowerCase())
    return { phrase, form: formLabels[term?.form ?? 'extra'], score: term?.score }
  })
})

const providerId = computed(() => hearing.activeTranscriptionProvider)
const sherpawModel = computed(() => {
  if (providerId.value !== SHERPAW_TRANSCRIPTION_PROVIDER_ID)
    return undefined
  const modelId = providerConfigs.getProviderConfig(SHERPAW_TRANSCRIPTION_PROVIDER_ID)?.model
  return Object.values(sherpawModels).find(model => model.id === modelId)
})
const delivery = computed(() => describeBiasDelivery({
  providerId: providerId.value,
  supportsHotwords: providers.getTranscriptionFeatures(providerId.value).supportsHotwords,
  sherpawModel: sherpawModel.value,
}, bias.value))

const files = shallowRef<File[]>()
const recorded = shallowRef<Blob>()
const clip = computed<Blob | undefined>(() => recorded.value ?? files.value?.[0])
const clipUrl = useObjectUrl(clip)
watch(files, () => recorded.value = undefined)

const recorder = useClipRecorder()
async function record() {
  const audio = await recorder.record()
  if (audio)
    recorded.value = audio
}

const comparison = useBiasComparison()
function compare() {
  if (clip.value)
    void comparison.compare(clip.value, bias.value)
}

/** The phrases that the shown comparison sent, so later edits of the list do not change its results. */
const comparedPhrases = computed(() => comparison.runs.value.find(run => run.bias)?.bias?.phrases ?? [])

/** Compared phrases that occur in a transcript, compared without case. */
function foundPhrases(text: string | undefined) {
  const lower = text?.toLocaleLowerCase() ?? ''
  return comparedPhrases.value.filter(phrase => lower.includes(phrase.toLocaleLowerCase()))
}
const gained = computed(() => {
  const [plain, biased] = comparison.runs.value
  if (plain?.text === undefined || biased?.text === undefined)
    return []
  const before = new Set(foundPhrases(plain.text))
  return foundPhrases(biased.text).filter(phrase => !before.has(phrase))
})
</script>

<template>
  <div :class="['flex flex-col gap-8 pb-12']">
    <div :class="['text-sm text-neutral-500 dark:text-neutral-400']">
      Shows the terms that bias speech recognition and what the active Hearing provider receives.
      The voice store rebuilds this list after each assistant turn. Speech start reads the last list.
    </div>

    <section :class="['flex flex-col gap-4']">
      <h2 :class="['text-lg font-semibold']">
        Conversation
      </h2>
      <FieldSelect v-model="source" label="Source" :options="sourceOptions" />
      <FieldSelect v-if="source === 'session'" v-model="selectedSessionId" label="Chat" :options="sessionOptions" placeholder="Select a chat" />
      <div v-if="source === 'session'" :class="['flex flex-wrap items-center gap-4']">
        <Button icon="i-solar:refresh-bold" label="Reload the chat" @click="loadSelectedSession" />
        <span :class="['text-sm text-neutral-500']">{{ sessionMessages.length }} messages</span>
        <span v-if="sessionError" :class="['text-sm text-red-500']">{{ sessionError }}</span>
      </div>
      <FieldTextArea
        v-else
        v-model="pasted"
        label="Messages"
        description="One message per line, starting with user: or assistant:. Only user and assistant messages count."
        :required="false"
        :rows="8"
      />
      <FieldTextArea
        v-model="extra"
        label="Extra phrases"
        description="One phrase per line. They join the list after the conversation terms, as a later source such as memory will."
        :required="false"
        :rows="3"
      />
    </section>

    <section :class="['flex flex-col gap-4']">
      <h2 :class="['text-lg font-semibold']">
        Bias list
      </h2>
      <p v-if="rows.length === 0" :class="['text-sm text-neutral-500']">
        No term qualifies. Quoted spans, identifiers such as useMemo or ASR, and capitalized names inside a sentence qualify.
      </p>
      <table v-else :class="['w-full text-left text-sm']">
        <thead>
          <tr :class="['text-xs text-neutral-500']">
            <th :class="['py-1']">
              Phrase
            </th>
            <th>Form</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.phrase" :class="['border-t border-neutral-200 dark:border-neutral-800']">
            <td :class="['py-1 font-mono']">
              {{ row.phrase }}
            </td>
            <td :class="['text-neutral-500']">
              {{ row.form }}
            </td>
            <td :class="['font-mono text-neutral-500']">
              {{ row.score?.toFixed(2) ?? '-' }}
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section :class="['flex flex-col gap-4']">
      <h2 :class="['text-lg font-semibold']">
        Delivery
      </h2>
      <div :class="['flex flex-wrap items-center gap-3 text-sm']">
        <span :class="['font-mono']">{{ providerId || '(no provider)' }}</span>
        <span v-if="sherpawModel" :class="['text-neutral-500']">{{ sherpawModel.name }}</span>
        <span
          :class="[
            'rounded px-2 py-0.5 text-xs font-medium',
            {
              'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300': delivery.status === 'sent',
              'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300': delivery.status === 'ignored',
              'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300': delivery.status === 'unsupported',
            },
          ]"
        >
          {{ delivery.status }}
        </span>
      </div>
      <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
        {{ delivery.note }}
      </p>
      <pre v-if="delivery.phrases.length" :class="['max-h-48 overflow-auto whitespace-pre-wrap rounded-lg p-3 text-xs', 'bg-neutral-100 dark:bg-neutral-800']">{{ delivery.phrases.join('\n') }}</pre>
    </section>

    <section :class="['flex flex-col gap-4']">
      <h2 :class="['text-lg font-semibold']">
        Compare
      </h2>
      <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
        Transcribes one clip with the active Hearing provider twice, without and with the bias list above.
      </div>
      <FieldInputFile v-model="files" label="Clip" description="Any audio file the browser can decode." accept="audio/*" />
      <div :class="['flex flex-wrap items-center gap-4']">
        <Button v-if="!recorder.recording.value" icon="i-solar:microphone-bold" label="Record" @click="record" />
        <Button v-else icon="i-solar:stop-bold" color="red" label="Stop" @click="recorder.stop()" />
        <Button
          variant="primary" color="primary" icon="i-solar:play-bold" label="Compare"
          :disabled="!clip || comparison.running.value || recorder.recording.value"
          @click="compare"
        />
        <span v-if="recorder.error.value" :class="['text-sm text-red-500']">{{ recorder.error.value }}</span>
      </div>
      <audio v-if="clipUrl" :src="clipUrl" controls />
      <div
        v-for="run in comparison.runs.value"
        :key="run.label"
        :class="['flex flex-col gap-1 rounded-lg p-3 text-sm', 'bg-neutral-100 dark:bg-neutral-800']"
      >
        <div :class="['flex gap-3 text-xs text-neutral-500']">
          <span :class="['font-medium']">{{ run.label }}</span>
          <span v-if="run.milliseconds !== undefined" :class="['font-mono']">{{ (run.milliseconds / 1000).toFixed(1) }} s</span>
          <span v-else-if="!run.error">Transcribing...</span>
        </div>
        <span v-if="run.error" :class="['text-red-500']">{{ run.error }}</span>
        <span v-else-if="run.text !== undefined">{{ run.text || '(no words)' }}</span>
        <span v-if="run.text" :class="['text-xs text-neutral-500']">
          Bias phrases found: {{ foundPhrases(run.text).join(', ') || 'none' }}
        </span>
      </div>
      <p v-if="gained.length" :class="['text-sm text-green-600 dark:text-green-400']">
        Only the biased run found: {{ gained.join(', ') }}
      </p>
    </section>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  title: Transcription Bias
  subtitleKey: tamagotchi.settings.devtools.title
</route>
