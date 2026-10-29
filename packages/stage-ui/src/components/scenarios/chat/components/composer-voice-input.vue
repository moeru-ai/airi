<script lang="ts">
/**
 * What a tap on the composer microphone does.
 *
 * - `transcription`: dictation. A tap records, and a second tap puts the text into the composer, or sends it with Auto send.
 * - `walkie`: walkie-talkie. A tap turns the input into a hold-to-talk bar. Each hold dictates, and a release ends it.
 * - `audio`: voice message. A tap records, and a second tap sends the audio, or keeps it for the send button.
 */
</script>

<script setup lang="ts">
import type { ChatToolReference } from '../../../../types/chat'

import { BasicButton, DropdownMenu } from '@proj-airi/ui'
import { useEventListener, useLocalStorage, useNow } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import {
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuItemIndicator,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from 'reka-ui'
import { computed, nextTick, onBeforeUnmount, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import VoiceMessagePlayer from './voice-message-player.vue'
import VoiceWaveform from './voice-waveform.vue'

import { useHearingStore } from '../../../../stores/modules/hearing'
import { useVoiceComposer } from '../composables/use-voice-composer'

export type ComposerVoiceMode = 'transcription' | 'walkie' | 'audio'

// The control also teleports its bars into the host surface, so host classes go to the microphone wrapper.
defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  sessionId: string
  replyToMessageId?: string
  tools?: ChatToolReference[]
  /**
   * A positioned area next to the microphone, such as the text area of a touch composer or the status slot of a desktop
   * toolbar. The recording status and the walkie-talkie bar cover it. The microphone itself becomes the stop button or the
   * keyboard button, so it stays outside this area. The host can hide its content there while `activeChange` reports true.
   */
  surface: HTMLElement | null
  /**
   * A slot above the composer text, next to other attachments. A recorded voice message that waits to be sent shows there.
   * The host's send button sends it through `sendPending`.
   */
  attachmentElement: HTMLElement | null
  /**
   * `sm` is 32px for the desktop composer. `md` is 36px for touch.
   * @default 'sm'
   */
  size?: 'sm' | 'md'
}>(), { size: 'sm' })

const emit = defineEmits<{
  /** The host started to send a voice message. */
  sent: []
  /** A recording bar or the walkie-talkie bar covers the input surface, or not any more. The host hides its text under it. */
  activeChange: [active: boolean]
  /**
   * A recording opened or closed. The host keeps its send button off while one is open, because the transcript is not in
   * the composer yet. The walkie-talkie bar can stay open between recordings, so this differs from `activeChange`.
   */
  recordingChange: [recording: boolean]
  /** Dictation finished with Auto send on. The host submits its composer, which now holds the transcript. */
  submit: []
  /**
   * The user asked for Hearing settings. The host opens this route in its own window or router.
   * Dictation without a transcription provider asks for the speech recognition page.
   */
  configure: [route: '/settings/modules/hearing' | '/settings/modules/hearing/transcriber']
  /** A recorded voice message waits to be sent, or not any more. The host enables its send button while one waits. */
  pendingChange: [pending: boolean]
}>()

const draft = defineModel<string>({ required: true })

/** A press this long opens the mode menu instead of acting on the mode. */
const MENU_PRESS_MS = 450
/** A hold that moves this far up cancels the walkie-talkie input when released. */
const WALKIE_CANCEL_DISTANCE_PX = 56
const MODES = ['transcription', 'walkie', 'audio'] as const satisfies readonly ComposerVoiceMode[]

const { t } = useI18n()
const storedMode = useLocalStorage<ComposerVoiceMode>('ui/chat/composer-voice-mode', 'transcription')
/** A stored value from another release can be unknown. It falls back to dictation, which is the default. */
const mode = computed<ComposerVoiceMode>({
  get: () => (MODES as readonly string[]).includes(storedMode.value) ? storedMode.value : 'transcription',
  set: value => storedMode.value = value,
})
const { autoSendEnabled } = storeToRefs(useHearingStore())

const voice = useVoiceComposer({
  sessionId: () => props.sessionId,
  replyToMessageId: () => props.replyToMessageId,
  tools: () => props.tools,
  onTranscript: (text) => {
    draft.value = [draft.value.trimEnd(), text.trim()].filter(Boolean).join(' ')
  },
  onSent: () => emit('sent'),
  onError: message => toast.error(t('stage.chat.voice-composer.failed'), { description: message }),
})
const { phase, level, startedAt, pending } = voice
const recording = computed(() => phase.value !== 'idle')

/** The input surface shows the hold-to-talk bar instead of the text. */
const walkie = shallowRef(false)
/** The pointer that holds the walkie-talkie bar, and where the hold started. */
const hold = shallowRef<{ pointerId: number, startY: number }>()
/** The hold moved far enough up that a release cancels it. */
const cancelling = shallowRef(false)

/** A tap started this recording, so the recording bar with its stop button covers the surface. */
const tapRecording = computed(() => recording.value && !walkie.value)
const active = computed(() => recording.value || walkie.value)
watch(active, value => emit('activeChange', value))
watch(recording, value => emit('recordingChange', value))
onBeforeUnmount(() => {
  emit('activeChange', false)
  emit('recordingChange', false)
})

const menuOpen = shallowRef(false)
watch(recording, (value) => {
  if (value)
    menuOpen.value = false
})

const now = useNow({ interval: 250 })
const stoppedAt = shallowRef(0)
watch(phase, (value) => {
  if (value === 'processing')
    stoppedAt.value = Date.now()
})
const elapsed = computed(() => {
  if (!startedAt.value)
    return '0:00'
  const end = phase.value === 'processing' ? stoppedAt.value : now.value.getTime()
  const seconds = Math.max(0, Math.floor((end - startedAt.value) / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
})

const modeIcons = {
  transcription: 'i-mingcute:mic-line',
  walkie: 'i-mingcute:voice-line',
  audio: 'i-mingcute:audio-tape-line',
} as const satisfies Record<ComposerVoiceMode, string>

function needsTranscriber(value: ComposerVoiceMode) {
  if (value === 'audio' || voice.transcriptionConfigured.value)
    return false
  toast(t('stage.chat.voice-composer.configure-title'), {
    description: t('stage.chat.voice-composer.configure-description'),
    action: { label: t('stage.chat.voice-composer.configure-action'), onClick: () => emit('configure', '/settings/modules/hearing/transcriber') },
  })
  return true
}

/**
 * Ends a dictation and, with Auto send, asks the host to send the composer.
 * The host learns that the recording closed through `recordingChange`. Its send guard reads that flag after this tick.
 */
async function finishDictation() {
  await voice.finish()
  if (!autoSendEnabled.value || !draft.value.trim())
    return
  await nextTick()
  emit('submit')
}

/** Triggering workflow: microphone tap -> act on the mode, or stop the recording that a tap started. */
async function tap() {
  if (tapRecording.value) {
    if (voice.mode.value === 'audio')
      await voice.finish({ send: autoSendEnabled.value })
    else
      await finishDictation()
    return
  }
  if (needsTranscriber(mode.value))
    return
  if (mode.value === 'walkie') {
    walkie.value = true
    return
  }
  await voice.start(mode.value)
}

/** Triggering workflow: Escape, the bar cancel button, or a cancelled hold -> discard the recording. */
async function cancel() {
  hold.value = undefined
  cancelling.value = false
  await voice.cancel()
}

function leaveWalkie() {
  void cancel()
  walkie.value = false
}

// A long press on the microphone opens the mode menu. The click that follows the press does not act on the mode.
let pressTimer: ReturnType<typeof setTimeout> | undefined
let suppressClick = false
function pressStart(event: PointerEvent) {
  if (!event.isPrimary || event.button !== 0 || recording.value)
    return
  suppressClick = false
  clearTimeout(pressTimer)
  pressTimer = setTimeout(() => {
    suppressClick = true
    menuOpen.value = true
  }, MENU_PRESS_MS)
}
function pressEnd() {
  clearTimeout(pressTimer)
}
function click() {
  if (suppressClick) {
    suppressClick = false
    return
  }
  // In walkie-talkie mode the microphone is the keyboard button, which returns the surface to text.
  if (walkie.value) {
    leaveWalkie()
    return
  }
  void tap()
}

/** Triggering workflow: walkie-talkie bar pointerdown -> capture the pointer -> dictate until the release. */
function holdStart(event: PointerEvent) {
  if (!event.isPrimary || event.button !== 0 || recording.value)
    return
  const target = event.currentTarget
  if (target instanceof HTMLElement)
    target.setPointerCapture(event.pointerId)
  hold.value = { pointerId: event.pointerId, startY: event.clientY }
  cancelling.value = false
  void voice.start('transcription')
}

function holdMove(event: PointerEvent) {
  if (event.pointerId !== hold.value?.pointerId)
    return
  cancelling.value = hold.value.startY - event.clientY > WALKIE_CANCEL_DISTANCE_PX
}

/**
 * Triggering workflow: the hold ends -> finish or cancel.
 * Without Auto send the text goes into the composer, and the surface returns to the keyboard so the text can be edited.
 */
async function releaseHold() {
  const cancelled = cancelling.value
  hold.value = undefined
  cancelling.value = false
  if (cancelled) {
    await voice.cancel()
    return
  }
  await finishDictation()
  if (!autoSendEnabled.value && draft.value.trim())
    walkie.value = false
}

function holdEnd(event: PointerEvent) {
  if (event.pointerId === hold.value?.pointerId)
    void releaseHold()
}

/** Keyboard holds use this pointer ID, so a pointer release cannot end them. */
const KEYBOARD_HOLD = -1

// Keyboard users hold Space or Enter on the focused walkie-talkie bar.
function holdKeyDown(event: KeyboardEvent) {
  if ((event.key !== ' ' && event.key !== 'Enter') || event.repeat || recording.value)
    return
  event.preventDefault()
  hold.value = { pointerId: KEYBOARD_HOLD, startY: 0 }
  void voice.start('transcription')
}
function holdKeyUp(event: KeyboardEvent) {
  if ((event.key !== ' ' && event.key !== 'Enter') || hold.value?.pointerId !== KEYBOARD_HOLD)
    return
  event.preventDefault()
  void releaseHold()
}

watch(mode, () => {
  if (walkie.value)
    leaveWalkie()
})

useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  if (event.key !== 'Escape' || event.isComposing || !active.value)
    return
  if (walkie.value && !recording.value)
    walkie.value = false
  else
    void cancel()
})

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

/** The microphone acts on the mode while idle, stops a tap recording, and returns to the keyboard from walkie-talkie. */
const buttonLabel = computed(() => {
  if (tapRecording.value)
    return t(autoSendEnabled.value ? 'stage.chat.voice-composer.stop-send' : 'stage.chat.voice-composer.stop')
  if (walkie.value)
    return t('stage.chat.voice-composer.keyboard')
  return t(`stage.chat.voice-composer.${mode.value}`)
})
const buttonIcon = computed(() => {
  if (tapRecording.value)
    return phase.value === 'recording' ? 'i-mingcute:stop-fill' : 'i-svg-spinners:ring-resize'
  if (walkie.value)
    return 'i-mingcute:keyboard-line'
  return modeIcons[mode.value]
})
const walkieLabel = computed(() => {
  if (!hold.value)
    return t('stage.chat.voice-composer.hold-to-talk')
  if (cancelling.value)
    return t('stage.chat.voice-composer.release-to-cancel')
  return t(autoSendEnabled.value ? 'stage.chat.voice-composer.release-to-send' : 'stage.chat.voice-composer.release-to-insert')
})

const sizeClass = computed(() => props.size === 'md' ? 'size-9' : 'size-8')
const roundButtonClasses = computed(() => [
  sizeClass.value,
  'shrink-0 flex items-center justify-center rounded-full outline-none',
  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary-500',
  'transition-colors duration-150 motion-reduce:transition-none',
])
/**
 * The stop button is smaller than the microphone and sits centered in the same slot, so the field keeps its height and
 * the button keeps its place. A soft neutral surface marks it as the active control without a loud color.
 */
const stopButtonClasses = computed(() => [
  props.size === 'md' ? 'size-7' : 'size-6',
  'shrink-0 flex items-center justify-center rounded-full outline-none',
  'bg-neutral-700 text-white hover:bg-neutral-600 dark:bg-white/20 dark:text-white dark:hover:bg-white/30',
  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary-500',
  'transition-colors duration-150 motion-reduce:transition-none',
])
const quietButtonClasses = computed(() => [
  ...roundButtonClasses.value,
  'text-neutral-500 hover:bg-neutral-900/8 dark:text-neutral-400 dark:hover:bg-white/10',
])
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
const separatorClasses = ['mx-2 my-1 h-px bg-neutral-200/80 dark:bg-neutral-700/80']

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
</script>

<template>
  <!-- The slot keeps the size of the microphone, so the smaller stop button stays centered in the same place. -->
  <div v-bind="$attrs" :class="['relative shrink-0 flex items-center justify-center', sizeClass]">
    <BasicButton
      size="unset"
      type="button"
      data-testid="composer-voice-button"
      :data-mode="mode"
      :data-state="tapRecording ? 'recording' : walkie ? 'walkie' : 'idle'"
      :disabled="!voice.available.value || (tapRecording && phase !== 'recording') || !!hold"
      :aria-label="buttonLabel"
      :title="active ? buttonLabel : `${buttonLabel} · ${t('stage.chat.voice-composer.mode-hint')}`"
      aria-haspopup="menu"
      :aria-expanded="menuOpen"
      :class="[
        tapRecording ? stopButtonClasses : quietButtonClasses,
        'touch-none select-none [-webkit-touch-callout:none]',
        !tapRecording && 'hover:text-primary-600 dark:hover:text-primary-300',
      ]"
      @pointerdown="pressStart"
      @pointerup="pressEnd"
      @pointerleave="pressEnd"
      @pointercancel="pressEnd"
      @click="click"
      @contextmenu.prevent="menuOpen = true"
      @keydown.up.prevent="menuOpen = true"
    >
      <span :class="[buttonIcon, tapRecording ? 'size-3' : 'size-5']" aria-hidden="true" />
    </BasicButton>
    <DropdownMenu v-model:open="menuOpen" :modal="false" side="top" align="end" variant="blurry" :content-class="['min-w-[240px]']">
      <template #trigger>
        <!-- The menu anchors to the microphone. The button keeps its tap for recording, so this anchor takes no pointer input. -->
        <span aria-hidden="true" tabindex="-1" :class="['pointer-events-none absolute inset-0']" />
      </template>
      <DropdownMenuLabel :class="labelClasses">
        {{ t('stage.chat.voice-composer.mode') }}
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup v-model="mode">
        <DropdownMenuRadioItem
          v-for="item in MODES"
          :key="item"
          :value="item"
          :data-testid="`composer-voice-mode-${item}`"
          :class="radioItemClasses"
        >
          <span :class="[modeIcons[item], 'size-4 shrink-0']" />
          <span :class="['flex-1']">{{ t(`stage.chat.voice-composer.${item}`) }}</span>
          <DropdownMenuItemIndicator>
            <span :class="['i-mingcute:check-line size-4 shrink-0']" />
          </DropdownMenuItemIndicator>
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator :class="separatorClasses" />
      <!-- The item toggles the switch, so the switch itself takes no input. -->
      <DropdownMenuCheckboxItem v-model="autoSendEnabled" data-testid="composer-voice-auto-send" :class="itemClasses" @select.prevent>
        <span :class="['flex-1']">{{ t('stage.chat.voice-composer.auto-send') }}</span>
        <span aria-hidden="true" :class="switchTrackClasses(autoSendEnabled)">
          <span :class="switchThumbClasses(autoSendEnabled)" />
        </span>
      </DropdownMenuCheckboxItem>
      <DropdownMenuSeparator :class="separatorClasses" />
      <DropdownMenuItem :class="itemClasses" @select="emit('configure', '/settings/modules/hearing')">
        <span :class="['flex-1']">{{ t('stage.chat.voice-composer.hearing-settings') }}</span>
        <span :class="['i-mingcute:right-line size-4 shrink-0 opacity-60']" />
      </DropdownMenuItem>
    </DropdownMenu>
  </div>

  <Teleport v-if="surface" :to="surface">
    <!-- A tap recording: the waveform fills the area up to the microphone, which is now the red stop button. -->
    <div
      v-if="tapRecording"
      data-testid="composer-voice-recording"
      role="status"
      :aria-label="t(phase === 'processing' ? 'stage.chat.voice-composer.processing' : voice.mode.value === 'audio' ? 'stage.chat.voice-composer.recording' : 'stage.chat.voice-composer.listening')"
      :data-phase="phase"
      :class="['absolute inset-0 z-10 flex items-center gap-2 pl-1 pr-1.5', 'text-neutral-500 dark:text-neutral-400', 'animate-fadeIn motion-reduce:animate-none']"
    >
      <BasicButton
        size="unset"
        type="button"
        data-testid="composer-voice-cancel"
        :aria-label="t('stage.chat.voice-composer.cancel')"
        :title="t('stage.chat.voice-composer.cancel')"
        :class="quietButtonClasses"
        @click="cancel"
      >
        <span :class="['i-mingcute:close-line size-4.5']" aria-hidden="true" />
      </BasicButton>
      <span v-if="phase === 'processing'" :class="['min-w-0 flex-1 truncate text-xs text-neutral-500 dark:text-neutral-400']">
        {{ t('stage.chat.voice-composer.processing') }}
      </span>
      <!-- The waveform takes the text color of the bar, so it matches the cancel button and the time. -->
      <VoiceWaveform v-else :level="level" :active="phase === 'recording'" :class="['text-current']" />
      <span data-testid="composer-voice-time" :class="['shrink-0 text-xs tabular-nums']">{{ elapsed }}</span>
    </div>
    <!-- Walkie-talkie: the whole area is the hold area. The microphone is now the keyboard button. -->
    <button
      v-else-if="walkie"
      type="button"
      data-testid="composer-voice-hold"
      :data-holding="!!hold"
      :data-cancelling="cancelling"
      :aria-label="walkieLabel"
      :class="[
        'absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-[inherit] px-3',
        'touch-none select-none outline-none [-webkit-touch-callout:none]',
        'text-sm font-medium transition-colors duration-150 motion-reduce:transition-none',
        'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-500',
        !hold && 'text-neutral-600 hover:bg-neutral-900/5 dark:text-neutral-300 dark:hover:bg-white/5',
        hold && !cancelling && 'bg-primary-500/15 text-primary-700 dark:text-primary-200',
        cancelling && 'bg-red-500/15 text-red-600 dark:text-red-300',
      ]"
      @pointerdown="holdStart"
      @pointermove="holdMove"
      @pointerup="holdEnd"
      @pointercancel="cancel"
      @contextmenu.prevent
      @keydown="holdKeyDown"
      @keyup="holdKeyUp"
    >
      <VoiceWaveform v-if="hold && phase === 'recording'" :level="level" :active="true" :class="['max-w-24 text-current']" />
      <span v-else-if="hold" :class="['i-svg-spinners:ring-resize size-4 shrink-0']" aria-hidden="true" />
      <span :class="['truncate']">{{ walkieLabel }}</span>
    </button>
  </Teleport>
  <!-- A recorded voice message that waits for the host's send button: Auto send was off, or the send failed. -->
  <Teleport v-if="attachmentElement" :to="attachmentElement">
    <VoiceMessagePlayer
      v-if="pendingMessage"
      data-testid="composer-voice-pending"
      :audio="pendingMessage.audio"
      :class="[pendingMessage.error && 'ring-1 ring-red-500/60', 'animate-fadeIn motion-reduce:animate-none']"
    >
      <template #actions>
        <span v-if="pendingMessage.error" role="alert" :title="pendingMessage.error" :class="['i-mingcute:warning-line size-4 shrink-0 text-red-500']" />
        <BasicButton
          size="unset"
          type="button"
          data-testid="composer-voice-pending-discard"
          :aria-label="t('stage.chat.voice-composer.discard')"
          :title="t('stage.chat.voice-composer.discard')"
          :class="quietButtonClasses"
          @click="voice.discard(pendingMessage.id)"
        >
          <span :class="['i-mingcute:close-line size-4.5']" aria-hidden="true" />
        </BasicButton>
      </template>
    </VoiceMessagePlayer>
  </Teleport>
</template>
