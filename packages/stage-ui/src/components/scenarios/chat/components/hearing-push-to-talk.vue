<script setup lang="ts">
import { isStageWeb } from '@proj-airi/stage-shared'
import { BasicButton } from '@proj-airi/ui'
import { useEventListener } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import { appendHearingDraft } from '../../../../services/hearing-drafts'
import { useSpeakingStore } from '../../../../stores/audio'
import { useChatStore } from '../../../../stores/chat'
import { useHearingStore } from '../../../../stores/modules/hearing'
import { useSettingsAudioDevice } from '../../../../stores/settings/audio-device'
import { useSpeechOutputControlStore } from '../../../../stores/speech-output-control'
import { useVoiceComposer } from '../composables/use-voice-composer'

const props = defineProps<{
  sessionId: string
  size?: 'default' | 'large'
  routeTranscript?: (result: { sessionId: string, text: string }) => Promise<void>
}>()
const emit = defineEmits<{ recordingChange: [recording: boolean] }>()
const { t } = useI18n()
const { mode } = storeToRefs(useSettingsAudioDevice())
const { autoSendEnabled } = storeToRefs(useHearingStore())
const { nowSpeaking } = storeToRefs(useSpeakingStore())
const speechOutput = useSpeechOutputControlStore()
const chat = useChatStore()
const held = shallowRef(false)
const recording = shallowRef(false)
const isVisible = computed(() => mode.value === 'push-to-talk')
let pointerId: number | undefined
let keyboardHeld = false

const voice = useVoiceComposer({
  sessionId: () => props.sessionId,
  needsTranscription: () => true,
  onError: (message) => {
    if (!/empty|no text|no speech/iu.test(message))
      toast.error(t('stage.voice.failed'), { description: message })
  },
  complete: async (result) => {
    if (!result.text)
      return
    if (props.routeTranscript) {
      await props.routeTranscript({ sessionId: result.sessionId, text: result.text })
      return
    }
    if (autoSendEnabled.value)
      await chat.send({ sessionId: result.sessionId, text: result.text })
    else
      appendHearingDraft(result.sessionId, result.text)
  },
})

async function begin() {
  if (held.value || !isVisible.value)
    return
  if (!voice.configured.value) {
    toast.error(t('stage.voice.configure-title'), { description: t('stage.voice.configure-description') })
    return
  }
  held.value = true
  emit('recordingChange', true)
  const speaking = nowSpeaking.value
  if (speaking) {
    speechOutput.requestStopSpeaking('push-to-talk')
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  if (!held.value)
    return
  recording.value = true
  await voice.start('transcription')
}

async function end() {
  if (!held.value)
    return
  held.value = false
  emit('recordingChange', false)
  if (!recording.value)
    return
  recording.value = false
  await voice.finish()
}

function onPointerDown(event: PointerEvent) {
  if (!event.isPrimary || event.button !== 0 || !isVisible.value)
    return
  pointerId = event.pointerId
  void begin()
}

function onPointerUp(event: PointerEvent) {
  if (pointerId !== event.pointerId)
    return
  pointerId = undefined
  void end()
}

useEventListener(window, 'pointerup', onPointerUp, { capture: true })
useEventListener(window, 'pointercancel', onPointerUp, { capture: true })
useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  if (!isStageWeb() || !isVisible.value || keyboardHeld || event.repeat)
    return
  if (event.code !== 'Space' || !event.ctrlKey || !event.altKey)
    return
  event.preventDefault()
  keyboardHeld = true
  void begin()
})
useEventListener(window, 'keyup', (event: KeyboardEvent) => {
  if (!keyboardHeld)
    return
  if (event.code !== 'Space' && event.ctrlKey && event.altKey)
    return
  keyboardHeld = false
  void end()
})
useEventListener(window, 'blur', () => {
  keyboardHeld = false
  void end()
})
</script>

<template>
  <BasicButton
    v-if="isVisible"
    size="unset"
    :aria-label="t('stage.voice.push-to-talk')"
    :title="t('stage.voice.push-to-talk')"
    :class="[
      'flex shrink-0 items-center justify-center rounded-full select-none touch-none',
      props.size === 'large' ? 'size-11' : 'size-9',
      held ? 'bg-primary-500 text-white' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-200',
    ]"
    @pointerdown="onPointerDown"
  >
    <div :class="[held ? 'i-solar:microphone-bold' : 'i-solar:microphone-linear', 'size-5']" />
  </BasicButton>
</template>
