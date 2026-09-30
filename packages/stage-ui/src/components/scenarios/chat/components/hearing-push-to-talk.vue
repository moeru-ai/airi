<script setup lang="ts">
import { isStageWeb } from '@proj-airi/stage-shared'
import { BasicButton } from '@proj-airi/ui'
import { useEventListener } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import { usePushToTalk } from '../composables/use-push-to-talk'

const props = defineProps<{ sessionId: string, size?: 'default' | 'large' }>()
const emit = defineEmits<{ recordingChange: [active: boolean] }>()
const { t } = useI18n()
const input = usePushToTalk({
  sessionId: () => props.sessionId,
  onError: message => toast.error(t('stage.voice.failed'), { description: message }),
  onRecordingChange: active => emit('recordingChange', active),
})
const { enabled, held } = input
let pointerId: number | undefined
let keyboardHeld = false

function begin() {
  if (!input.configured.value) {
    toast.error(t('stage.voice.configure-title'), { description: t('stage.voice.configure-description') })
    return
  }
  void input.begin()
}

function onPointerDown(event: PointerEvent) {
  if (!event.isPrimary || event.button !== 0)
    return
  pointerId = event.pointerId
  begin()
}

useEventListener(window, 'pointerup', (event: PointerEvent) => {
  if (event.pointerId !== pointerId)
    return
  pointerId = undefined
  void input.end()
}, { capture: true })
useEventListener(window, 'pointercancel', () => {
  void input.cancel()
})
useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  if (!isStageWeb() || !enabled.value || keyboardHeld || event.repeat || event.code !== 'Space' || !event.ctrlKey || !event.altKey)
    return
  event.preventDefault()
  keyboardHeld = true
  begin()
})
useEventListener(window, 'keyup', (event: KeyboardEvent) => {
  if (!keyboardHeld || (event.code !== 'Space' && event.ctrlKey && event.altKey))
    return
  keyboardHeld = false
  void input.end()
})
useEventListener(window, 'blur', () => {
  keyboardHeld = false
  void input.cancel()
})
</script>

<template>
  <BasicButton
    v-if="enabled"
    size="unset"
    :aria-label="t('stage.voice.push-to-talk')"
    :aria-pressed="held"
    :title="t('stage.voice.push-to-talk')"
    :class="[
      'flex shrink-0 items-center justify-center rounded-full select-none touch-none',
      props.size === 'large' ? 'size-11' : 'size-10',
      held ? 'bg-primary-500 text-white' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-200',
      'focus-visible:ring-2 focus-visible:ring-primary-500',
    ]"
    @pointerdown="onPointerDown"
    @keydown.space.prevent="!$event.repeat && begin()"
    @keyup.space.prevent="input.end()"
  >
    <span :class="[held ? 'i-solar:microphone-bold' : 'i-solar:microphone-linear', 'size-5']" aria-hidden="true" />
  </BasicButton>
</template>
