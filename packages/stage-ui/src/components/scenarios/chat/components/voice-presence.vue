<script lang="ts">
/**
 * What the voice presence paints.
 *
 * - `hidden`: nothing.
 * - `capsule`: a small listening pill. Speech capture started, and no transcript text exists yet.
 * - `card`: the expanded draft. Live transcript text or an editable draft exists.
 * - `sent`: the host sends the speech to the chat. The card shows the sent text and moves up out of view.
 */
</script>

<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { computed, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import RewriteText from '../../../widgets/rewrite-text/rewrite-text.vue'
import VoiceDrafts from './voice-drafts.vue'

import { useChatSessionStore } from '../../../../stores/chat/session-store'
import { useAiriCardStore } from '../../../../stores/modules/airi-card'
import { useVoiceControlsStore } from '../../../../stores/voice-controls'

export type VoicePresenceView = 'hidden' | 'capsule' | 'card' | 'sent'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  /**
   * Escape in this window dismisses the shown speech. A host that also listens for Escape elsewhere, such as a global
   * shortcut, calls the exposed `dismiss` instead or as well. A second call finds nothing to dismiss.
   * @default true
   */
  escapeDismisses?: boolean
}>(), { escapeDismisses: true })

const emit = defineEmits<{
  /** The painted view changed. A window host uses it, for example, to update its pointer hit test or return home. */
  shownChange: [view: VoicePresenceView]
  /** The card finished appearing. */
  afterEnter: []
  /** The card finished leaving. */
  afterLeave: []
}>()

/** Bars of the capsule level meter. Each bar scales the same level by its own factor, so the meter looks like a voice. */
const LEVEL_BARS = [0.55, 0.85, 1, 0.75, 0.5] as const

const { t } = useI18n()
const controls = useVoiceControlsStore()
const sessions = useChatSessionStore()
const cards = useAiriCardStore()

/**
 * Content that Escape dismissed. It stays hidden, so a dismissal never comes back by itself.
 * A dismissed input is cancelled on the host. A dismissed draft stays in the host's draft list, so a draft is keyed by
 * its text: an edit elsewhere shows it here again.
 */
const dismissed = shallowRef<{ requestId?: string, drafts: ReadonlySet<string> }>({ drafts: new Set() })
const draftKey = (draft: { id: string, text: string }) => `${draft.id}\0${draft.text}`

const liveInput = computed(() => {
  const input = controls.snapshot.input
  return input && input.phase !== 'settled' && input.requestId !== dismissed.value.requestId ? input : undefined
})
const editableDrafts = computed(() => controls.snapshot.drafts.filter(draft => !draft.sending && !dismissed.value.drafts.has(draftKey(draft))))
const sendingDraft = computed(() => controls.snapshot.drafts.find(draft => draft.sending))

/** The last text that went to the chat. It stays on the card while the card moves out, after the host removed the draft. */
const sentText = shallowRef('')

/**
 * The text that live speech showed last. Auto send moves the card from live speech straight to the sent text, so a
 * rewrite of the speech plays on the sent card. An editable draft in between already showed the rewritten text.
 */
const spokenText = shallowRef('')
/** The rewrite that the sent card plays before it moves out. Undefined when the sent text equals the spoken text. */
const sentRewrite = shallowRef<{ from: string, to: string }>()
watch(() => liveInput.value?.text, (value) => {
  if (value?.trim())
    spokenText.value = value.trim()
})
// Speech that settled into an editable draft showed its rewrite in the draft. A later manual send does not replay it.
watch(() => !liveInput.value && editableDrafts.value.length > 0, (settledIntoDraft) => {
  if (settledIntoDraft)
    spokenText.value = ''
})
watch(sendingDraft, (draft) => {
  if (!draft)
    return
  sentText.value = draft.text
  const from = spokenText.value
  spokenText.value = ''
  sentRewrite.value = from && from !== draft.text.trim() ? { from, to: draft.text.trim() } : undefined
})

const view = computed<VoicePresenceView>(() => {
  if (liveInput.value && !liveInput.value.text.trim() && !editableDrafts.value.some(draft => draft.sessionId === liveInput.value!.sessionId))
    return 'capsule'
  if (liveInput.value || editableDrafts.value.length)
    return 'card'
  if (sendingDraft.value)
    return 'sent'
  return 'hidden'
})

/**
 * The send animation outlives the draft. Auto send removes the draft once the chat stores it, which can be faster
 * than the animation. A `sent` view that ends without new speech keeps the card until the animation finishes.
 */
const sending = shallowRef(false)
watch(view, (next, previous) => {
  if (next === 'sent')
    sending.value = true
  else if (next !== 'hidden' || previous !== 'sent')
    sending.value = false
})

const shown = computed<VoicePresenceView>(() => view.value === 'hidden' && sending.value ? 'sent' : view.value)
watch(shown, value => emit('shownChange', value), { flush: 'post' })

const characterName = computed(() => {
  const sessionId = liveInput.value?.sessionId
  const characterId = sessionId ? sessions.sessionMetas[sessionId]?.characterId : undefined
  return characterId ? cards.getCard(characterId)?.name : undefined
})

/**
 * The leave motion says why the card went away. `dismiss` shrinks and fades the card in place after Escape.
 * `pop` is the ordinary exit after speech ends without text.
 */
const leave = shallowRef<'pop' | 'dismiss'>('pop')
watch(shown, (value) => {
  if (value !== 'hidden')
    leave.value = 'pop'
})

/**
 * Escape interrupts what the card shows. Live speech is cancelled on the host, because hidden listening would leave
 * the user unsure whether AIRI still hears.
 */
function dismiss() {
  if (shown.value === 'hidden' || shown.value === 'sent')
    return

  leave.value = 'dismiss'
  const input = liveInput.value
  dismissed.value = { requestId: input?.requestId, drafts: new Set(controls.snapshot.drafts.map(draftKey)) }
  if (input)
    void controls.command({ type: 'cancel-presented', requestId: input.requestId }).catch(() => {})
}

useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  // An IME can use Escape to cancel its candidate list.
  if (!props.escapeDismisses || event.key !== 'Escape' || event.isComposing)
    return
  if (shown.value !== 'capsule' && shown.value !== 'card')
    return
  event.preventDefault()
  dismiss()
})

defineExpose({
  /** The painted view. */
  shown,
  dismiss,
})
</script>

<template>
  <!-- An explicit duration, because Vue otherwise also waits for the finished send animation on the leaving card. -->
  <Transition :name="`voice-presence-${leave}`" :duration="{ enter: 220, leave: leave === 'dismiss' ? 220 : 160 }" @after-enter="emit('afterEnter')" @after-leave="emit('afterLeave')">
    <div
      v-if="shown !== 'hidden'"
      data-testid="voice-presence"
      v-bind="$attrs"
      :style="{ '--un-bg-opacity': 0.95 }"
      :data-view="shown"
      :class="[
        'overflow-hidden shadow-lg',
        'bg-white dark:bg-neutral-900',
        'transition-[width,height,border-radius] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
        shown === 'capsule' ? 'h-11 w-44 rounded-full' : 'h-40 w-full max-w-110 rounded-3xl',
        shown === 'sent' && !sentRewrite ? 'voice-presence-send' : '',
      ]"
      @animationend="sending = false"
    >
      <div
        v-if="shown === 'capsule'"
        role="status"
        :class="['drag-region h-full w-full flex items-center gap-2.5 px-4', 'text-sm text-neutral-600 dark:text-neutral-300']"
      >
        <span aria-hidden="true" :class="['h-4 flex shrink-0 items-center gap-0.5']">
          <span
            v-for="(factor, index) in LEVEL_BARS"
            :key="index"
            :class="['w-0.75 rounded-full bg-primary-500', 'transition-[height] duration-100 motion-reduce:transition-none']"
            :style="{ height: `${Math.round(25 + 75 * Math.min(1, controls.level * factor * 1.6))}%` }"
          />
        </span>
        <span :class="['min-w-0 truncate']">
          {{ t('stage.chat.voice-draft.listening') }}<template v-if="characterName"> · {{ characterName }}</template>
        </span>
      </div>
      <div
        v-else-if="shown === 'sent'"
        role="status"
        :class="['h-full w-full flex flex-col gap-1.5 px-4 py-3']"
      >
        <span :class="['flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400']">
          <span aria-hidden="true" :class="['i-solar:arrow-up-outline size-3.5 text-primary-500']" />
          {{ t('stage.chat.voice-draft.sent') }}
        </span>
        <p v-if="sentRewrite" :class="['m-0 line-clamp-4 whitespace-pre-wrap break-words text-[15px] font-medium leading-relaxed']">
          <RewriteText :from="sentRewrite.from" :to="sentRewrite.to" @finished="sentRewrite = undefined" />
        </p>
        <p v-else :class="['m-0 line-clamp-4 whitespace-pre-wrap break-words text-[15px] font-medium leading-relaxed']" v-text="sentText" />
      </div>
      <VoiceDrafts v-else show-silent-speech>
        <template #hint>
          <!-- Content at the start of the draft action row, such as a shortcut hint. -->
          <slot name="hint" />
        </template>
      </VoiceDrafts>
    </div>
  </Transition>
</template>

<style scoped>
.voice-presence-pop-enter-active,
.voice-presence-dismiss-enter-active {
  transition:
    opacity 220ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

.voice-presence-pop-leave-active {
  transition:
    opacity 160ms ease-in,
    transform 160ms ease-in;
}

.voice-presence-pop-enter-from,
.voice-presence-pop-leave-to,
.voice-presence-dismiss-enter-from {
  opacity: 0;
  transform: translateY(8px) scale(0.92);
}

/* Escape shrinks the card toward its center, so the interruption reads as a close, not a send. */
.voice-presence-dismiss-leave-active {
  transition:
    opacity 220ms ease-in,
    transform 220ms cubic-bezier(0.4, 0, 1, 1);
}

.voice-presence-dismiss-leave-to {
  opacity: 0;
  transform: scale(0.85);
}

/* The sent card rises toward the chat and fades, so the speech reads as a message that left. */
.voice-presence-send {
  animation: voice-presence-send 520ms cubic-bezier(0.4, 0, 0.2, 1) 180ms forwards;
}

@keyframes voice-presence-send {
  to {
    opacity: 0;
    transform: translateY(-40px) scale(0.96);
  }
}

@media (prefers-reduced-motion: reduce) {
  .voice-presence-pop-enter-active,
  .voice-presence-pop-leave-active,
  .voice-presence-dismiss-enter-active,
  .voice-presence-dismiss-leave-active {
    transition: opacity 120ms linear;
  }

  .voice-presence-pop-enter-from,
  .voice-presence-pop-leave-to,
  .voice-presence-dismiss-enter-from,
  .voice-presence-dismiss-leave-to {
    transform: none;
  }

  .voice-presence-send {
    animation: voice-presence-send-reduced 240ms linear 180ms forwards;
  }

  @keyframes voice-presence-send-reduced {
    to {
      opacity: 0;
    }
  }
}
</style>
