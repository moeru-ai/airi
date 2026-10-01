<script setup lang="ts">
import { BasicButton, Button } from '@proj-airi/ui'
import { nanoid } from 'nanoid/non-secure'
import { computed, onScopeDispose, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import VoiceMessagePreview from './voice-message-preview.vue'

import { useChatSessionStore } from '../../../../stores/chat/session-store'
import { useVoiceControlsStore } from '../../../../stores/voice-controls'
import { useVoiceInput } from '../composables/use-voice-input'

const { t } = useI18n()
const sessions = useChatSessionStore()
const controls = useVoiceControlsStore()
const speech = useVoiceInput()
const requestId = ref<string>()
const holding = ref(false)
let starting: Promise<unknown> | undefined
const messages = computed(() => controls.messages.filter(message => message.sessionId === sessions.activeSessionId))
const recording = computed(() => requestId.value ? controls.messages.find(message => message.id === requestId.value) : undefined)

watch(() => recording.value?.phase, (phase) => {
  if (phase === 'failed' || phase === 'cancelled')
    requestId.value = undefined
})

function start() {
  if (requestId.value || !sessions.activeSessionId)
    return
  const id = nanoid()
  requestId.value = id
  starting = controls.messageCommand({ type: 'record', id, sessionId: sessions.activeSessionId }).catch(() => {
    if (requestId.value === id)
      requestId.value = undefined
  })
}

async function finish(type: 'finish' | 'discard' = 'finish') {
  const id = requestId.value
  if (!id)
    return
  requestId.value = undefined
  await starting
  await controls.messageCommand({ type, id }).catch(() => {})
}

function beginDictation() {
  holding.value = true
  void speech.start().catch(() => {
    holding.value = false
  })
}

function cancelDictation() {
  holding.value = false
  void speech.cancel().catch(() => {})
}

function press(event: PointerEvent) {
  if (event.button !== 0 || requestId.value)
    return
  const button = event.currentTarget as HTMLElement
  button.setPointerCapture(event.pointerId)
  beginDictation()
}

function release() {
  if (!holding.value)
    return
  holding.value = false
  void speech.end().catch(() => {})
}

function keyDown(event: KeyboardEvent) {
  if ((event.key !== ' ' && event.key !== 'Enter') || event.repeat || requestId.value)
    return
  event.preventDefault()
  beginDictation()
}

function keyUp(event: KeyboardEvent) {
  if (event.key === ' ' || event.key === 'Enter') {
    event.preventDefault()
    release()
  }
}

onScopeDispose(() => {
  void finish('discard')
})
</script>

<template>
  <section :aria-label="t('stage.chat.voice-message.title')" :class="['flex flex-col gap-2']">
    <div :class="['flex flex-wrap items-center gap-2']">
      <Button size="sm" :disabled="!controls.snapshot.connected || holding" :aria-pressed="!!requestId" @click="requestId ? finish() : start()">
        {{ t(requestId ? 'stage.chat.voice-message.finish' : 'stage.chat.voice-message.record') }}
      </Button>
      <BasicButton
        type="button"
        :disabled="!controls.snapshot.connected || (!!requestId && !holding)"
        :aria-pressed="holding"
        :class="['touch-none rounded-lg px-3 py-2 text-sm', 'bg-neutral-100 dark:bg-neutral-900 disabled:opacity-50']"
        @pointerdown="press"
        @pointerup="release"
        @pointercancel="cancelDictation"
        @lostpointercapture="release"
        @keydown="keyDown"
        @keyup="keyUp"
        @blur="release"
      >
        {{ t('stage.chat.voice-message.dictate') }}
      </BasicButton>
      <span v-if="requestId" role="status" :class="['text-sm']">
        {{ t(recording && recording.phase === 'capturing' ? 'stage.chat.voice-message.recording' : 'stage.chat.voice-message.starting') }}
      </span>
    </div>
    <VoiceMessagePreview v-for="message in messages.filter(message => !['pending', 'capturing'].includes(message.phase))" :key="message.id" :message="message" />
    <p v-if="controls.error" role="alert" :class="['text-sm text-red-600 dark:text-red-400']">
      {{ controls.error }}
    </p>
  </section>
</template>
