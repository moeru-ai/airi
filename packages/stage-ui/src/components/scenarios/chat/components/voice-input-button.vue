<script setup lang="ts">
import type { ChatToolReference } from '../../../../types/chat'
import type { VoiceComposerMode } from '../composables/use-voice-composer'

import { BasicButton, DropdownMenu } from '@proj-airi/ui'
import { useEventListener, useLocalStorage, useNow, useObjectUrl, useTimeoutFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import {
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuItemIndicator,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from 'reka-ui'
import { computed, nextTick, shallowRef, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import VoiceWaveform from './voice-waveform.vue'

import { useHearingStore } from '../../../../stores/modules/hearing'
import { useSettingsAudioDevice } from '../../../../stores/settings/audio-device'
import { useVoiceComposer } from '../composables/use-voice-composer'

const props = defineProps<{
  sessionId: string
  replyToMessageId?: string
  tools?: ChatToolReference[]
  /** The element above the composer that holds the voice status bar. The bar is not shown without it. */
  statusElement: HTMLElement | null
}>()
const emit = defineEmits<{
  /** A voice message reached chat storage. */
  sent: []
  /** Recording opened or closed. While dictation runs, the host keeps its text read-only, because the transcript writes into it. */
  recordingChange: [active: boolean]
  /** Dictation finished with Auto send on. The host submits its composer, which now holds the transcript. */
  submit: []
  /** The user asked for Hearing settings. The host opens them in its own window or route. */
  configure: []
}>()
const draft = defineModel<string>({ required: true })

/** Hovering the button this long opens the options menu. A shorter pass over the button does nothing. */
const MENU_HOVER_DELAY_MS = 600
/** The menu closes after the pointer leaves the button and the menu for this long. */
const MENU_LEAVE_DELAY_MS = 300

const { t } = useI18n()
const mode = useLocalStorage<VoiceComposerMode>('ui/chat/voice-mode', 'audio')
const { autoSendEnabled } = storeToRefs(useHearingStore())
const devices = useSettingsAudioDevice()
const { audioInputOptions, selectedAudioInput, enabled: listening } = storeToRefs(devices)
const menuOpen = shallowRef(false)

/** Composer text before dictation started. The live transcript is shown after it until the input ends. */
let draftBeforeDictation: string | undefined

function withTranscript(base: string, text: string) {
  return [base.trimEnd(), text.trim()].filter(Boolean).join(' ')
}

const voice = useVoiceComposer({
  sessionId: () => props.sessionId,
  replyToMessageId: () => props.replyToMessageId,
  tools: () => props.tools,
  onTranscript: (text) => {
    draft.value = withTranscript(draftBeforeDictation ?? draft.value, text)
    draftBeforeDictation = undefined
  },
  onSent: () => emit('sent'),
  onError: message => toast.error(t('stage.chat.voice-composer.failed'), { description: message }),
})
const { phase, transcript, level, startedAt, pending } = voice
const active = computed(() => phase.value !== 'idle')
const activeMode = computed(() => voice.mode.value ?? mode.value)
const now = useNow({ interval: 250 })
const stoppedAt = shallowRef(0)

const elapsed = computed(() => formatDuration(startedAt.value ? ((phase.value === 'processing' ? stoppedAt.value : now.value.getTime()) - startedAt.value) / 1000 : 0))

function formatDuration(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

watch(phase, (value) => {
  if (value === 'processing')
    stoppedAt.value = Date.now()
})
watch(active, value => emit('recordingChange', value))

// Dictation writes the live transcript into the composer. The final text from the host replaces it when the input ends.
watch(transcript, (text) => {
  if (draftBeforeDictation !== undefined && text)
    draft.value = withTranscript(draftBeforeDictation, text)
})

/** Triggering workflow: button click -> toggle -> start, or finish with the Auto send setting. */
async function toggle() {
  closeMenu()
  if (!active.value) {
    if (mode.value === 'transcription' && !voice.transcriptionConfigured.value) {
      toast(t('stage.chat.voice-composer.configure-title'), {
        description: t('stage.chat.voice-composer.configure-description'),
        action: { label: t('stage.chat.voice-composer.configure-action'), onClick: () => emit('configure') },
      })
      return
    }
    if (mode.value === 'transcription')
      draftBeforeDictation = draft.value
    await voice.start(mode.value)
    return
  }

  const dictation = activeMode.value === 'transcription'
  await voice.finish({ send: autoSendEnabled.value })
  if (!dictation || !autoSendEnabled.value || !draft.value.trim())
    return
  // The host learns that recording closed through `recordingChange`. Its send guard reads that flag after this tick.
  await nextTick()
  emit('submit')
}

/** Triggering workflow: status bar cancel, or Escape while recording -> discard the recording and restore the composer text. */
async function cancel() {
  if (draftBeforeDictation !== undefined) {
    draft.value = draftBeforeDictation
    draftBeforeDictation = undefined
  }
  await voice.cancel()
}

useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  if (event.key === 'Escape' && active.value)
    void cancel()
})

const hoverOpen = useTimeoutFn(() => {
  if (!active.value)
    menuOpen.value = true
}, MENU_HOVER_DELAY_MS, { immediate: false })
const leaveClose = useTimeoutFn(() => menuOpen.value = false, MENU_LEAVE_DELAY_MS, { immediate: false })

function pointerEnter() {
  leaveClose.stop()
  if (!menuOpen.value)
    hoverOpen.start()
}

function pointerLeave() {
  hoverOpen.stop()
  if (menuOpen.value)
    leaveClose.start()
}

function closeMenu() {
  hoverOpen.stop()
  leaveClose.stop()
  menuOpen.value = false
}

function openMenu() {
  if (active.value)
    return
  hoverOpen.stop()
  menuOpen.value = true
}

// NOTICE:
// Opening the menu does not ask for permission. A hover is no user activation, so the opened AudioContext never resumes.
// Source: `microphoneSource` in packages/audio/src/browser/sources.ts awaits `context.resume()`.
// Remove when that source stops waiting for resume.
async function setListening(value: boolean) {
  if (value && !await devices.askPermission())
    return
  listening.value = value
}

/** The newest pending voice message. Older ones stay pending until this one is sent or discarded. */
const pendingMessage = computed(() => pending.value.at(-1))
const pendingUrl = useObjectUrl(computed(() => pendingMessage.value?.audio))
const player = useTemplateRef<HTMLAudioElement>('player')
const playing = shallowRef(false)
const playedSeconds = shallowRef(0)
const durationSeconds = shallowRef(0)

function togglePlayback() {
  if (!player.value)
    return
  if (player.value.paused)
    void player.value.play()
  else
    player.value.pause()
}

const iconClass = computed(() => {
  if (phase.value === 'starting' || phase.value === 'processing')
    return 'i-svg-spinners:ring-resize'
  if (active.value)
    return 'i-solar:stop-bold'
  return activeMode.value === 'audio' ? 'i-solar:microphone-3-bold' : 'i-solar:text-field-focus-linear'
})

const buttonLabel = computed(() => {
  if (!active.value)
    return t(`stage.chat.voice-composer.${mode.value}`)
  return t(autoSendEnabled.value ? 'stage.chat.voice-composer.stop-send' : 'stage.chat.voice-composer.stop')
})

const itemClasses = [
  'w-full flex cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-2 text-left',
  'text-sm leading-none outline-none text-neutral-700 dark:text-neutral-200',
  'data-[highlighted]:bg-primary-100/80 dark:data-[highlighted]:bg-primary-900/40',
  'data-[state=checked]:text-primary-600 dark:data-[state=checked]:text-primary-300',
  'transition-colors duration-150 ease-in-out',
]
const labelClasses = ['px-3 pb-1 pt-2 text-xs text-neutral-500 dark:text-neutral-400']
const separatorClasses = ['mx-2 my-1 h-px bg-neutral-200/80 dark:bg-neutral-700/80']
</script>

<template>
  <div :class="['relative shrink-0']" @pointerenter="pointerEnter" @pointerleave="pointerLeave">
    <BasicButton
      size="unset"
      type="button"
      data-testid="voice-input-button"
      :disabled="!voice.available.value || (phase === 'processing')"
      :aria-pressed="active"
      :aria-label="buttonLabel"
      :title="active ? buttonLabel : `${buttonLabel} · ${t('stage.chat.voice-composer.options-hint')}`"
      :class="[
        'size-9 flex items-center justify-center rounded-full outline-none',
        'focus-visible:ring-2 focus-visible:ring-primary-500 transition-colors duration-200 motion-reduce:transition-none',
        active
          ? 'bg-red-500 text-white hover:bg-red-600'
          : 'bg-primary-100/90 text-primary-600 hover:bg-primary-200/90 dark:bg-primary-900/90 dark:text-primary-200 dark:hover:bg-primary-800/90',
      ]"
      @click="toggle"
      @contextmenu.prevent="openMenu"
      @keydown.up.prevent="openMenu"
    >
      <span :class="[iconClass, 'size-5']" aria-hidden="true" />
    </BasicButton>
    <DropdownMenu v-model:open="menuOpen" :modal="false" side="top" align="end" variant="blurry" :content-class="['min-w-[240px]']">
      <template #trigger>
        <!-- The menu anchors to the button area. The button keeps its click for recording, so this anchor takes no pointer input. -->
        <span aria-hidden="true" tabindex="-1" :class="['pointer-events-none absolute inset-0']" />
      </template>
      <div @pointerenter="leaveClose.stop()" @pointerleave="pointerLeave">
        <DropdownMenuLabel :class="labelClasses">
          {{ t('stage.chat.voice-composer.mode') }}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup v-model="mode">
          <DropdownMenuRadioItem value="audio" :class="itemClasses" @select.prevent>
            <span :class="['i-solar:microphone-3-linear size-4 shrink-0']" />
            <span :class="['flex-1']">{{ t('stage.chat.voice-composer.audio') }}</span>
            <DropdownMenuItemIndicator>
              <span :class="['i-ph:check-bold size-4 shrink-0']" />
            </DropdownMenuItemIndicator>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="transcription" :class="itemClasses" @select.prevent>
            <span :class="['i-solar:text-field-focus-linear size-4 shrink-0']" />
            <span :class="['flex-1']">{{ t('stage.chat.voice-composer.transcription') }}</span>
            <DropdownMenuItemIndicator>
              <span :class="['i-ph:check-bold size-4 shrink-0']" />
            </DropdownMenuItemIndicator>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator :class="separatorClasses" />
        <DropdownMenuCheckboxItem v-model="autoSendEnabled" :class="itemClasses" @select.prevent>
          <span :class="['i-solar:plain-2-linear size-4 shrink-0']" />
          <span :class="['flex-1']">{{ t('stage.chat.voice-composer.auto-send') }}</span>
          <DropdownMenuItemIndicator>
            <span :class="['i-ph:check-bold size-4 shrink-0']" />
          </DropdownMenuItemIndicator>
        </DropdownMenuCheckboxItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger :class="itemClasses">
            <span :class="['i-solar:microphone-large-linear size-4 shrink-0']" />
            <span :class="['flex-1']">{{ t('stage.chat.voice-composer.input-device') }}</span>
            <span :class="['i-solar:alt-arrow-right-linear size-4 shrink-0 opacity-60']" />
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            :side-offset="6"
            :class="[
              'z-[10001] max-h-72 min-w-[220px] overflow-y-auto rounded-xl border p-1 shadow-lg outline-none backdrop-blur-md',
              'border-neutral-100/80 bg-neutral-100/90 dark:border-neutral-800/60 dark:bg-neutral-800/90',
            ]"
            @pointerenter="leaveClose.stop()"
          >
            <DropdownMenuRadioGroup v-model="selectedAudioInput">
              <DropdownMenuRadioItem
                v-for="device in audioInputOptions"
                :key="device.value"
                :value="device.value"
                :class="itemClasses"
                @select.prevent
              >
                <span :class="['flex-1 truncate']">{{ device.value === 'default' ? t('stage.chat.voice-composer.system-default') : device.label }}</span>
                <DropdownMenuItemIndicator>
                  <span :class="['i-ph:check-bold size-4 shrink-0']" />
                </DropdownMenuItemIndicator>
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator :class="separatorClasses" />
        <DropdownMenuCheckboxItem :model-value="listening" :class="itemClasses" @update:model-value="setListening" @select.prevent>
          <span :class="['i-solar:soundwave-linear size-4 shrink-0']" />
          <span :class="['flex-1']">{{ t('stage.chat.voice-composer.listen') }}</span>
          <DropdownMenuItemIndicator>
            <span :class="['i-ph:check-bold size-4 shrink-0']" />
          </DropdownMenuItemIndicator>
        </DropdownMenuCheckboxItem>
        <DropdownMenuItem :class="itemClasses" @select="emit('configure')">
          <span :class="['i-solar:settings-linear size-4 shrink-0']" />
          <span :class="['flex-1']">{{ t('stage.chat.voice-composer.hearing-settings') }}</span>
        </DropdownMenuItem>
      </div>
    </DropdownMenu>
  </div>

  <Teleport v-if="statusElement" :to="statusElement">
    <!-- Recording: level waveform, elapsed time, and cancel. Dictation text goes into the composer, not into this bar. -->
    <div
      v-if="active"
      data-testid="voice-status-bar"
      :data-phase="phase"
      :class="[
        'mb-2 h-10 flex items-center gap-3 rounded-xl px-3',
        'bg-neutral-100/90 text-neutral-700 shadow-sm backdrop-blur-md dark:bg-neutral-900/90 dark:text-neutral-200',
      ]"
    >
      <span :class="['size-2 shrink-0 rounded-full bg-red-500', phase === 'recording' && 'animate-pulse motion-reduce:animate-none']" aria-hidden="true" />
      <span :class="['shrink-0 text-xs text-neutral-500 dark:text-neutral-400']">
        {{ t(phase === 'processing' ? 'stage.chat.voice-composer.processing' : activeMode === 'audio' ? 'stage.chat.voice-composer.recording' : 'stage.chat.voice-composer.listening') }}
      </span>
      <VoiceWaveform :level="level" :active="phase === 'recording'" :class="['text-primary-500 dark:text-primary-300']" />
      <span data-testid="voice-status-time" :class="['shrink-0 text-xs font-medium tabular-nums']">{{ elapsed }}</span>
      <BasicButton
        size="unset"
        type="button"
        data-testid="voice-status-cancel"
        :aria-label="t('stage.chat.voice-composer.cancel')"
        :title="t('stage.chat.voice-composer.cancel')"
        :class="['size-7 shrink-0 flex items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-900/10 dark:text-neutral-400 dark:hover:bg-white/10']"
        @click="cancel"
      >
        <span :class="['i-solar:close-circle-linear size-5']" aria-hidden="true" />
      </BasicButton>
    </div>
    <!-- A voice message that waits for the user: Auto send was off, or the send failed. -->
    <div
      v-else-if="pendingMessage"
      data-testid="voice-pending-bar"
      :class="[
        'mb-2 h-10 flex items-center gap-2 rounded-xl px-2',
        'bg-neutral-100/90 text-neutral-700 shadow-sm backdrop-blur-md dark:bg-neutral-900/90 dark:text-neutral-200',
      ]"
    >
      <audio
        ref="player"
        :src="pendingUrl"
        preload="metadata"
        :class="['hidden']"
        @play="playing = true"
        @pause="playing = false"
        @ended="playing = false"
        @timeupdate="playedSeconds = ($event.target as HTMLAudioElement).currentTime"
        @loadedmetadata="durationSeconds = ($event.target as HTMLAudioElement).duration"
      />
      <BasicButton
        size="unset"
        type="button"
        :aria-label="t(playing ? 'stage.chat.voice-composer.pause' : 'stage.chat.voice-composer.play')"
        :class="['size-7 shrink-0 flex items-center justify-center rounded-full text-primary-600 hover:bg-primary-500/10 dark:text-primary-300']"
        @click="togglePlayback"
      >
        <span :class="[playing ? 'i-solar:pause-bold' : 'i-solar:play-bold', 'size-4']" aria-hidden="true" />
      </BasicButton>
      <div :class="['h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-neutral-900/10 dark:bg-white/10']">
        <div :class="['h-full rounded-full bg-primary-500']" :style="{ width: `${durationSeconds ? Math.min(100, playedSeconds / durationSeconds * 100) : 0}%` }" />
      </div>
      <span :class="['shrink-0 text-xs tabular-nums']">{{ formatDuration(playing ? playedSeconds : durationSeconds) }}</span>
      <span v-if="pendingMessage.error" role="alert" :title="pendingMessage.error" :class="['max-w-40 truncate text-xs text-red-600 dark:text-red-400']">
        {{ pendingMessage.error }}
      </span>
      <BasicButton
        size="unset"
        type="button"
        data-testid="voice-pending-discard"
        :aria-label="t('stage.chat.voice-composer.discard')"
        :title="t('stage.chat.voice-composer.discard')"
        :class="['size-7 shrink-0 flex items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-900/10 dark:text-neutral-400 dark:hover:bg-white/10']"
        @click="voice.discard(pendingMessage.id)"
      >
        <span :class="['i-solar:trash-bin-minimalistic-linear size-4']" aria-hidden="true" />
      </BasicButton>
      <BasicButton
        size="unset"
        type="button"
        data-testid="voice-pending-send"
        :aria-label="t(pendingMessage.error ? 'stage.chat.voice-composer.retry' : 'stage.chat.voice-composer.send')"
        :title="t(pendingMessage.error ? 'stage.chat.voice-composer.retry' : 'stage.chat.voice-composer.send')"
        :class="['size-7 shrink-0 flex items-center justify-center rounded-full bg-primary-500 text-white hover:bg-primary-600']"
        @click="voice.send(pendingMessage.id)"
      >
        <span :class="[pendingMessage.error ? 'i-solar:refresh-linear' : 'i-solar:arrow-up-outline', 'size-4']" aria-hidden="true" />
      </BasicButton>
    </div>
  </Teleport>
</template>
