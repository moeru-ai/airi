<script setup lang="ts">
import type { VoiceDraft } from '../../../../services/speech/bus'

import { joinTranscriptSegments } from '@proj-airi/provider-inference'
import { BasicButton, BasicTextarea, Button, GhostButton } from '@proj-airi/ui'
import { computed, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useChatSessionStore } from '../../../../stores/chat/session-store'
import { useAiriCardStore } from '../../../../stores/modules/airi-card'
import { useVoiceControlsStore } from '../../../../stores/voice-controls'

const props = withDefaults(defineProps<{
  /**
   * Layout and surface treatment.
   * `card` draws its own panel with labeled actions.
   * `composer` fills its host, such as a vibrancy window, and leaves the surface to the host.
   * @default 'card'
   */
  variant?: 'card' | 'composer'
}>(), { variant: 'card' })

const emit = defineEmits<{
  /** Whether a draft or live speech is shown. A host window can hide itself when nothing is shown. */
  presence: [visible: boolean]
}>()

const { t } = useI18n()
const controls = useVoiceControlsStore()
const sessions = useChatSessionStore()
const cards = useAiriCardStore()
const sending = ref(false)

/** Drafts that the user can still edit. A draft that the host is sending is on its way to the chat and stays hidden. */
const drafts = computed(() => controls.snapshot.drafts.filter(item => !item.sending))

/** Speech that the host is still transcribing. It is shown read-only until it becomes part of a draft. */
const liveInput = computed(() => {
  const input = controls.snapshot.input
  if (!input || (input.phase !== 'capturing' && input.phase !== 'finalizing'))
    return undefined
  return input.segments.some(segment => segment.text.trim()) ? input : undefined
})

/**
 * The draft on screen.
 * Live speech shows the draft of its own session, because the host merges the speech into that draft.
 * Otherwise the host's front draft is shown, and the newest draft replaces a front draft that is being sent.
 */
const draft = computed(() => {
  if (liveInput.value)
    return drafts.value.find(item => item.sessionId === liveInput.value!.sessionId)
  return drafts.value.find(item => item.id === controls.snapshot.frontDraftId) ?? drafts.value.at(-1)
})

function nameOf(sessionId: string) {
  const characterId = sessions.sessionMetas[sessionId]?.characterId
  return (characterId ? cards.getCard(characterId)?.name : undefined) ?? sessions.sessionMetas[sessionId]?.title
}

const characterName = computed(() => {
  const sessionId = liveInput.value?.sessionId ?? draft.value?.sessionId
  return sessionId ? nameOf(sessionId) : undefined
})

/** Drafts of other conversations. Live speech hides the switcher, because the speech already selects its conversation. */
const otherDrafts = computed<readonly VoiceDraft[]>(() => liveInput.value || drafts.value.length < 2 ? [] : drafts.value)

const text = computed({
  get: () => draft.value?.text ?? '',
  set: (value) => {
    if (draft.value)
      void controls.command({ type: 'edit-draft', draftId: draft.value.id, text: value }).catch(() => {})
  },
})

/**
 * Live speech continues the draft paragraph, joined by the same rule that the host uses when the speech settles.
 * Final text uses the body color. Pending text uses the theme color at a lower opacity, and the newest pending segment uses full opacity.
 */
const liveSegments = computed(() => {
  const segments = liveInput.value?.segments ?? []
  const latest = segments.findLastIndex(segment => !segment.final)
  return segments.map((segment, index) => ({
    id: segment.id,
    text: segment.text,
    tier: segment.final ? 'final' as const : index === latest ? 'latest' as const : 'interim' as const,
  }))
})
const liveSeparator = computed(() => {
  const base = text.value.trim()
  const live = liveInput.value?.text.trim() ?? ''
  if (!base || !live)
    return ''
  return joinTranscriptSegments([base, live]).length > base.length + live.length ? ' ' : ''
})

const visible = computed(() => !!draft.value || !!liveInput.value)
watch(visible, value => emit('presence', value), { immediate: true })

const scroller = useTemplateRef<HTMLElement>('scroller')

// New speech and host draft updates keep the newest text visible. Edits in the textarea do not scroll.
watch(
  () => [draft.value?.id, draft.value?.rawText, liveInput.value?.phase, liveSegments.value.map(segment => segment.text).join('')],
  () => {
    // BasicTextarea sets its new height in an animation frame. This frame runs after it.
    requestAnimationFrame(() => {
      if (scroller.value)
        scroller.value.scrollTop = scroller.value.scrollHeight
    })
  },
  { flush: 'post' },
)

const canSend = computed(() => !sending.value && !liveInput.value && !!text.value.trim() && controls.snapshot.connected)

async function send() {
  if (!draft.value || !canSend.value)
    return
  sending.value = true
  try {
    await controls.command({ type: 'send-draft', draftId: draft.value.id })
  }
  catch {
    // The host retains the draft and the controls store exposes the transport error.
  }
  finally {
    sending.value = false
  }
}

function discard() {
  if (draft.value)
    void controls.command({ type: 'discard-draft', draftId: draft.value.id }).catch(() => {})
}

function select(id: string) {
  void controls.command({ type: 'select-draft', draftId: id }).catch(() => {})
}

function handleKeydown(event: KeyboardEvent) {
  // Enter sends and Shift+Enter adds a line. An IME confirmation keeps the draft.
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing)
    return
  event.preventDefault()
  void send()
}
</script>

<template>
  <!-- The whole surface drags its host window. Text editing and buttons opt out. -->
  <section
    v-if="visible && props.variant === 'composer'"
    :aria-label="t('stage.chat.voice-draft.title')"
    :class="['drag-region h-full min-h-0 w-full flex flex-col']"
  >
    <header :class="['flex shrink-0 flex-col items-center gap-1.5 px-4 pt-1.5']">
      <span aria-hidden="true" :class="['h-1 w-8 rounded-full bg-neutral-900/15 dark:bg-white/20']" />
      <div :class="['min-w-0 w-full flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400']">
        <span
          aria-hidden="true"
          :class="[
            'size-1.5 shrink-0 rounded-full',
            liveInput ? 'bg-primary-500 animate-pulse motion-reduce:animate-none' : 'bg-neutral-400 dark:bg-neutral-500',
          ]"
        />
        <span role="status" :class="['shrink-0']">
          {{ t(liveInput?.phase === 'finalizing' ? 'stage.chat.voice-draft.finalizing' : liveInput ? 'stage.chat.voice-draft.listening' : 'stage.chat.voice-draft.title') }}
        </span>
        <span v-if="characterName && !otherDrafts.length" :class="['min-w-0 truncate']">· {{ characterName }}</span>
        <div v-if="otherDrafts.length" :class="['min-w-0 flex items-center gap-1 overflow-x-auto scrollbar-none', '[-webkit-app-region:no-drag]']">
          <GhostButton
            v-for="item in otherDrafts"
            :key="item.id"
            size="sm"
            :class="['max-w-32 shrink-0 truncate rounded-full px-2 text-xs']"
            :active="item.id === draft?.id"
            :aria-pressed="item.id === draft?.id"
            :disabled="sending"
            @click="select(item.id)"
          >
            {{ nameOf(item.sessionId) ?? t('stage.chat.voice-draft.title') }}
          </GhostButton>
        </div>
      </div>
    </header>
    <!-- The draft and the live speech are one paragraph. Speech is read-only until it settles into the draft. -->
    <div
      ref="scroller"
      data-testid="voice-draft-scroller"
      :class="[
        'min-h-0 w-full flex-1 overflow-y-auto px-4 py-1.5 text-[15px] font-medium leading-relaxed [scrollbar-gutter:stable]',
        'text-neutral-800 dark:text-neutral-100',
      ]"
    >
      <!-- v-text keeps template whitespace out of this pre-wrap block. -->
      <p v-if="liveInput" data-testid="voice-draft-live" :class="['m-0 whitespace-pre-wrap break-words']">
        <span v-if="text.trim()" v-text="text.trim() + liveSeparator" />
        <span
          v-for="segment in liveSegments"
          :key="segment.id"
          :data-tier="segment.tier"
          :class="[
            'transition-colors duration-300 motion-reduce:transition-none',
            segment.tier === 'interim' ? 'text-primary-600/60 dark:text-primary-300/60' : '',
            segment.tier === 'latest' ? 'text-primary-600 dark:text-primary-300' : '',
          ]"
          v-text="segment.text"
        />
      </p>
      <BasicTextarea
        v-else-if="draft"
        v-model="text"
        :submit-on-enter="false"
        :disabled="sending || !controls.snapshot.connected"
        :aria-label="t('stage.chat.voice-draft.title')"
        :class="[
          'block w-full resize-none overflow-hidden border-0 bg-transparent p-0 leading-relaxed outline-none',
          '[-webkit-app-region:no-drag]',
        ]"
        @keydown="handleKeydown"
      />
    </div>
    <p v-if="controls.error" role="alert" :class="['px-4 text-sm text-red-600 dark:text-red-400']">
      {{ controls.error }}
    </p>
    <footer :class="['h-11 flex shrink-0 items-center gap-2 px-3']">
      <div :class="['min-w-0 flex flex-1 items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400']">
        <!-- Composer variant only. The host puts content at the start of the action row, such as a shortcut hint. -->
        <slot name="hint" />
      </div>
      <div :class="['flex shrink-0 items-center gap-1', '[-webkit-app-region:no-drag]']">
        <GhostButton
          v-if="draft && !liveInput"
          size="unset"
          :class="['size-8 rounded-full']"
          :disabled="sending"
          :title="t('stage.chat.voice-draft.discard')"
          :aria-label="t('stage.chat.voice-draft.discard')"
          @click="discard"
        >
          <span :class="['i-solar:trash-bin-minimalistic-linear size-4.5']" />
        </GhostButton>
        <BasicButton
          size="unset"
          :disabled="!canSend"
          :title="t('stage.chat.actions.send')"
          :aria-label="t('stage.chat.actions.send')"
          :class="[
            'size-8 rounded-full bg-primary-500 text-white',
            'hover:bg-primary-600 disabled:pointer-events-none disabled:bg-neutral-900/10 disabled:text-neutral-400 dark:disabled:bg-white/10 dark:disabled:text-neutral-500 motion-reduce:transition-none',
          ]"
          @click="send"
        >
          <span :class="['i-solar:arrow-up-outline size-4.5']" />
        </BasicButton>
      </div>
    </footer>
  </section>
  <section
    v-else-if="draft"
    :aria-label="t('stage.chat.voice-draft.title')"
    :class="['min-w-0 w-full flex flex-col gap-2 rounded-xl p-3', 'bg-neutral-100/90 text-neutral-900 dark:bg-neutral-900/90 dark:text-neutral-100']"
  >
    <div :class="['min-w-0 w-full flex items-center gap-2 overflow-x-auto text-sm scrollbar-none']">
      <span :class="['shrink-0']">{{ t('stage.chat.voice-draft.title') }}</span>
      <span v-if="characterName && !otherDrafts.length" :class="['max-w-32 shrink-0 truncate']">{{ characterName }}</span>
      <Button
        v-for="item in otherDrafts"
        :key="item.id"
        size="sm"
        :class="['max-w-32 shrink-0 truncate']"
        :disabled="sending || item.id === draft.id"
        @click="select(item.id)"
      >
        {{ nameOf(item.sessionId) ?? t('stage.chat.voice-draft.title') }}
      </Button>
    </div>
    <BasicTextarea
      v-model="text"
      :submit-on-enter="false"
      :class="['w-full max-w-full']"
      :disabled="sending || !controls.snapshot.connected"
      :aria-label="t('stage.chat.voice-draft.title')"
      @keydown="handleKeydown"
    />
    <p v-if="controls.error" role="alert" :class="['text-sm text-red-600 dark:text-red-400']">
      {{ controls.error }}
    </p>
    <div :class="['flex justify-end gap-2']">
      <Button :disabled="sending" size="sm" @click="discard">
        {{ t('stage.chat.voice-draft.discard') }}
      </Button>
      <Button :disabled="!canSend" size="sm" variant="primary" @click="send">
        {{ t('stage.chat.actions.send') }}
      </Button>
    </div>
  </section>
</template>
