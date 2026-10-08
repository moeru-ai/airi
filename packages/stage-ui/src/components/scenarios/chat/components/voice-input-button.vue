<script setup lang="ts">
import type { ChatToolReference } from '../../../../types/chat'
import type { VoiceComposerMode } from '../composables/use-voice-composer'

import { BasicButton, DropdownMenu } from '@proj-airi/ui'
import { useEventListener, useIntervalFn, useLocalStorage, useNow, useObjectUrl } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import {
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuItemIndicator,
  DropdownMenuLabel,
  DropdownMenuPortal,
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
import { useVoiceControlsStore } from '../../../../stores/voice-controls'
import { useHoverMenu } from '../composables/use-hover-menu'
import { useVoiceComposer } from '../composables/use-voice-composer'

const props = defineProps<{
  sessionId: string
  replyToMessageId?: string
  tools?: ChatToolReference[]
  /** A flexible slot in the composer action row. The recording status shows there. */
  statusElement: HTMLElement | null
  /**
   * A slot above the composer text, next to other attachments. A recorded voice message that waits to be sent shows there.
   * The host's send button sends it through `sendPending`.
   */
  attachmentElement: HTMLElement | null
}>()
const emit = defineEmits<{
  /** The host started to send a voice message. */
  sent: []
  /** Recording opened or closed. While dictation runs, the host keeps its text read-only, because the transcript writes into it. */
  recordingChange: [active: boolean]
  /** Dictation finished with Auto send on. The host submits its composer, which now holds the transcript. */
  submit: []
  /** The user asked for Hearing settings. The host opens them in its own window or route. */
  configure: []
  /** A recorded voice message waits to be sent, or not any more. The host enables its send button while one waits. */
  pendingChange: [pending: boolean]
}>()
const draft = defineModel<string>({ required: true })

/** The open menu renews its level meter request this often. Each request lasts a little longer, so the meter does not gap. */
const LEVEL_MONITOR_RENEW_MS = 1000

const { t } = useI18n()
const mode = useLocalStorage<VoiceComposerMode>('ui/chat/voice-mode', 'audio')
const { autoSendEnabled } = storeToRefs(useHearingStore())
const devices = useSettingsAudioDevice()
const { audioInputOptions, selectedAudioInput, enabled: listening } = storeToRefs(devices)
const controls = useVoiceControlsStore()

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
/** The options menu opens on hover, a right-click, or the up arrow. It stays closed while a recording runs. */
const menu = useHoverMenu({ enabled: () => !active.value })
const menuOpen = menu.open
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
  menu.close()
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

// NOTICE:
// A browser resumes the microphone AudioContext only after a user activation, and a hover is none.
// So the meter waits for sticky activation. Electron plays without a gesture.
// Source: `microphoneSource` in packages/audio/src/browser/sources.ts awaits `context.resume()`.
// Remove when that source stops waiting for resume.
const monitor = useIntervalFn(() => {
  if (navigator.userActivation?.hasBeenActive ?? true)
    controls.monitorLevel(LEVEL_MONITOR_RENEW_MS * 1.5)
}, LEVEL_MONITOR_RENEW_MS, { immediate: false, immediateCallback: true })
watch(menuOpen, async (open) => {
  monitor.pause()
  if (!open)
    return
  // The meter must not cause a permission prompt on hover. Without granted permission it stays empty.
  const permission = await navigator.permissions?.query({ name: 'microphone' as PermissionName }).catch(() => undefined)
  if (menuOpen.value && (!permission || permission.state === 'granted'))
    monitor.resume()
})

/** Level of the selected microphone while the menu is open. The host's level from an earlier capture is not shown. */
const meterLevel = shallowRef(0)
watch(() => controls.level, (value) => {
  if (menuOpen.value)
    meterLevel.value = value
})
watch(menuOpen, () => meterLevel.value = 0)

const currentDevice = computed(() => {
  const option = audioInputOptions.value.find(item => item.value === selectedAudioInput.value)
  // Chromium labels the default entry "Default - <device>". An entry without a label shows the generic name.
  return option && option.label !== option.value ? option.label : t('stage.chat.voice-composer.system-default')
})

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
watch(() => !!pendingMessage.value, value => emit('pendingChange', value), { immediate: true })

/**
 * Sends the waiting voice message with the composer text in one user message.
 * `none` means that no voice message waits, so the host sends its composer as usual.
 * The host clears its text only on `sent`. On `failed` the text and the recording stay for a retry.
 */
async function sendPending(text: string): Promise<'none' | 'sent' | 'failed'> {
  const message = pendingMessage.value
  if (!message)
    return 'none'
  return await voice.send(message.id, text) ? 'sent' : 'failed'
}

defineExpose({ sendPending })
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
  'transition-colors duration-150 ease-in-out',
]
const radioItemClasses = [
  ...itemClasses,
  'data-[state=checked]:text-primary-600 dark:data-[state=checked]:text-primary-300',
]
const labelClasses = ['px-3 pb-1 pt-2 text-xs text-neutral-500 dark:text-neutral-400']

function switchTrackClasses(on: boolean) {
  return [
    'relative h-4.5 w-8 shrink-0 rounded-full transition-colors duration-200 motion-reduce:transition-none',
    on ? 'bg-primary-500' : 'bg-neutral-300 dark:bg-neutral-600',
  ]
}

function switchThumbClasses(on: boolean) {
  return [
    'absolute top-0.5 size-3.5 rounded-full bg-white shadow transition-transform duration-200 motion-reduce:transition-none',
    on ? 'translate-x-4' : 'translate-x-0.5',
  ]
}
/** Buttons in the status row share one size, so the row lines up. */
const statusButtonClasses = [
  'size-8 shrink-0 flex items-center justify-center rounded-full outline-none',
  'text-neutral-500 hover:bg-neutral-900/10 dark:text-neutral-400 dark:hover:bg-white/10',
  'transition-colors duration-150 motion-reduce:transition-none',
]
const separatorClasses = ['mx-2 my-1 h-px bg-neutral-200/80 dark:bg-neutral-700/80']
</script>

<template>
  <div :class="['relative shrink-0']" @pointerenter="menu.enter()" @pointerleave="menu.leave()">
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
        'focus:outline-none focus-visible:outline-none transition-colors duration-200 motion-reduce:transition-none',
        active
          ? 'bg-red-500 text-white hover:bg-red-600'
          : 'bg-primary-100/90 text-primary-600 hover:bg-primary-200/90 dark:bg-primary-900/90 dark:text-primary-200 dark:hover:bg-primary-800/90',
      ]"
      @click="toggle"
      @contextmenu.prevent="menu.openNow()"
      @keydown.up.prevent="menu.openNow()"
    >
      <span :class="[iconClass, 'size-5']" aria-hidden="true" />
    </BasicButton>
    <DropdownMenu v-model:open="menuOpen" :modal="false" side="top" align="end" variant="blurry" :content-class="['min-w-[240px]']">
      <template #trigger>
        <!-- The menu anchors to the button area. The button keeps its click for recording, so this anchor takes no pointer input. -->
        <span aria-hidden="true" tabindex="-1" :class="['pointer-events-none absolute inset-0']" />
      </template>
      <div @pointerenter="menu.enter()" @pointerleave="menu.leave()">
        <DropdownMenuLabel :class="labelClasses">
          {{ t('stage.chat.voice-composer.mode') }}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup v-model="mode">
          <DropdownMenuRadioItem value="audio" :class="radioItemClasses" @select.prevent>
            <span :class="['i-solar:microphone-3-linear size-4 shrink-0']" />
            <span :class="['flex-1']">{{ t('stage.chat.voice-composer.audio') }}</span>
            <DropdownMenuItemIndicator>
              <span :class="['i-ph:check-bold size-4 shrink-0']" />
            </DropdownMenuItemIndicator>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="transcription" :class="radioItemClasses" @select.prevent>
            <span :class="['i-solar:text-field-focus-linear size-4 shrink-0']" />
            <span :class="['flex-1']">{{ t('stage.chat.voice-composer.transcription') }}</span>
            <DropdownMenuItemIndicator>
              <span :class="['i-ph:check-bold size-4 shrink-0']" />
            </DropdownMenuItemIndicator>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator :class="separatorClasses" />
        <DropdownMenuLabel :class="labelClasses">
          {{ t('stage.chat.voice-composer.input-device') }}
        </DropdownMenuLabel>
        <!-- The current microphone and its live level. Its submenu lists the other devices. -->
        <DropdownMenuSub>
          <DropdownMenuSubTrigger data-testid="voice-menu-device" :class="[itemClasses, 'py-1.5']">
            <span :class="['min-w-0 flex flex-1 flex-col gap-1.5']">
              <span :class="['truncate']">{{ currentDevice }}</span>
              <span aria-hidden="true" :class="['h-1 w-full overflow-hidden rounded-full bg-neutral-900/10 dark:bg-white/10']">
                <span
                  data-testid="voice-menu-level"
                  :class="['block h-full rounded-full bg-primary-500 transition-[width] duration-75 motion-reduce:transition-none']"
                  :style="{ width: `${Math.round(meterLevel * 100)}%` }"
                />
              </span>
            </span>
            <span :class="['i-solar:alt-arrow-right-linear size-4 shrink-0 opacity-60']" />
          </DropdownMenuSubTrigger>
          <!-- A portal keeps the submenu above the menu. Inside the menu it opened behind it when it flipped to the left. -->
          <DropdownMenuPortal>
            <DropdownMenuSubContent
              :side-offset="6"
              :class="[
                'z-[10001] max-h-72 min-w-[220px] overflow-y-auto rounded-xl border p-1 shadow-lg outline-none backdrop-blur-md',
                'border-neutral-100/80 bg-neutral-100/90 dark:border-neutral-800/60 dark:bg-neutral-800/90',
              ]"
              @pointerenter="menu.enter()"
            >
              <DropdownMenuRadioGroup v-model="selectedAudioInput">
                <DropdownMenuRadioItem
                  v-for="device in audioInputOptions"
                  :key="device.value"
                  :value="device.value"
                  :class="radioItemClasses"
                  @select.prevent
                >
                  <span :class="['flex-1 truncate']">{{ device.label !== device.value ? device.label : t('stage.chat.voice-composer.system-default') }}</span>
                  <DropdownMenuItemIndicator>
                    <span :class="['i-ph:check-bold size-4 shrink-0']" />
                  </DropdownMenuItemIndicator>
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
        <DropdownMenuSeparator :class="separatorClasses" />
        <!-- Settings that change behavior are switches. The item toggles them, so the switch itself takes no input. -->
        <DropdownMenuCheckboxItem v-model="autoSendEnabled" data-testid="voice-menu-auto-send" :class="itemClasses" @select.prevent>
          <span :class="['flex-1']">{{ t('stage.chat.voice-composer.auto-send') }}</span>
          <span aria-hidden="true" :class="switchTrackClasses(autoSendEnabled)">
            <span :class="switchThumbClasses(autoSendEnabled)" />
          </span>
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem :model-value="listening" data-testid="voice-menu-listen" :class="itemClasses" @update:model-value="setListening" @select.prevent>
          <span :class="['flex-1']">{{ t('stage.chat.voice-composer.listen') }}</span>
          <span aria-hidden="true" :class="switchTrackClasses(listening)">
            <span :class="switchThumbClasses(listening)" />
          </span>
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator :class="separatorClasses" />
        <DropdownMenuItem :class="itemClasses" @select="emit('configure')">
          <span :class="['flex-1']">{{ t('stage.chat.voice-composer.hearing-settings') }}</span>
          <span :class="['i-solar:alt-arrow-right-linear size-4 shrink-0 opacity-60']" />
        </DropdownMenuItem>
      </div>
    </DropdownMenu>
  </div>

  <!-- The status sits in the composer action row, so the composer keeps its height while recording. -->
  <Teleport v-if="statusElement" :to="statusElement">
    <!--
      A CSS animation fades the status in. Vue's Transition advances on animation frames, which a throttled window can
      stop, and then the leaving status stayed on screen.
    -->
    <!-- Recording: level waveform and elapsed time. The red stop button shows that recording is on. -->
    <div
      v-if="active"
      data-testid="voice-status-bar"
      role="status"
      :aria-label="t(phase === 'processing' ? 'stage.chat.voice-composer.processing' : activeMode === 'audio' ? 'stage.chat.voice-composer.recording' : 'stage.chat.voice-composer.listening')"
      :data-phase="phase"
      :class="['h-8 min-w-0 flex flex-1 items-center gap-2 px-1 text-neutral-600 dark:text-neutral-300', 'animate-fadeIn motion-reduce:animate-none']"
    >
      <span v-if="phase === 'processing'" :class="['min-w-0 flex-1 truncate text-xs text-neutral-500 dark:text-neutral-400']">
        {{ t('stage.chat.voice-composer.processing') }}
      </span>
      <VoiceWaveform v-else :level="level" :active="phase === 'recording'" :class="['text-primary-500 dark:text-primary-300']" />
      <span data-testid="voice-status-time" :class="['shrink-0 text-xs tabular-nums']">{{ elapsed }}</span>
      <!--
        Discard is needed only with Auto send, where stopping sends at once. Without it, a voice message waits in the
        pending bar with its own discard, and dictated text stays editable. Escape always discards.
      -->
      <BasicButton
        v-if="autoSendEnabled"
        size="unset"
        type="button"
        data-testid="voice-status-cancel"
        :aria-label="t('stage.chat.voice-composer.cancel')"
        :title="t('stage.chat.voice-composer.cancel')"
        :class="statusButtonClasses"
        @click="cancel"
      >
        <span :class="['i-solar:close-circle-linear size-5']" aria-hidden="true" />
      </BasicButton>
    </div>
  </Teleport>
  <!-- A recorded voice message that waits for the host's send button: Auto send was off, or the send failed. -->
  <Teleport v-if="attachmentElement" :to="attachmentElement">
    <div
      v-if="pendingMessage"
      data-testid="voice-pending-card"
      :class="[
        'max-w-full w-72 h-10 flex items-center gap-1 rounded-xl px-1',
        'bg-neutral-900/5 text-neutral-600 dark:bg-white/8 dark:text-neutral-300',
        pendingMessage.error && 'ring-1 ring-red-500/60',
        'animate-fadeIn motion-reduce:animate-none',
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
        :class="[statusButtonClasses, 'text-primary-600 dark:text-primary-300']"
        @click="togglePlayback"
      >
        <span :class="[playing ? 'i-solar:pause-bold' : 'i-solar:play-bold', 'size-4']" aria-hidden="true" />
      </BasicButton>
      <div :class="['h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-neutral-900/10 dark:bg-white/10']">
        <div :class="['h-full rounded-full bg-primary-500']" :style="{ width: `${durationSeconds ? Math.min(100, playedSeconds / durationSeconds * 100) : 0}%` }" />
      </div>
      <span :class="['shrink-0 px-1 text-xs tabular-nums']">{{ formatDuration(playing ? playedSeconds : durationSeconds) }}</span>
      <span v-if="pendingMessage.error" role="alert" :title="pendingMessage.error" :class="['i-solar:danger-triangle-linear size-4 shrink-0 text-red-500']" />
      <BasicButton
        size="unset"
        type="button"
        data-testid="voice-pending-discard"
        :aria-label="t('stage.chat.voice-composer.discard')"
        :title="t('stage.chat.voice-composer.discard')"
        :class="statusButtonClasses"
        @click="voice.discard(pendingMessage.id)"
      >
        <span :class="['i-solar:close-circle-linear size-4.5']" aria-hidden="true" />
      </BasicButton>
    </div>
  </Teleport>
</template>
