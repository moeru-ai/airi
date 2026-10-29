<script setup lang="ts">
import type { PropType } from 'vue'

import type { VoiceHostSnapshot } from '../../../../services/speech/bus'

import { useIntervalFn } from '@vueuse/core'
import { defineComponent, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import VoicePresence from './voice-presence.vue'

import { useChatSessionStore } from '../../../../stores/chat/session-store'
import { useVoiceControlsStore } from '../../../../stores/voice-controls'

type State = 'capsule' | 'listening' | 'finalizing' | 'draft' | 'long-draft' | 'sent'

const stateOptions: { label: string, value: State }[] = [
  { label: 'Capsule (no text yet)', value: 'capsule' },
  { label: 'Listening (live text)', value: 'listening' },
  { label: 'Finalizing', value: 'finalizing' },
  { label: 'Editable draft', value: 'draft' },
  { label: 'Long draft (scrolls)', value: 'long-draft' },
  { label: 'Sent (plays once)', value: 'sent' },
]

const SESSION_ID = 'story-session'

const { t } = useI18n()

const state = ref<State>('listening')
// The desktop app draws native glass behind the card. A CSS blur stands in for it here.
const glass = ref(true)
/** Escape keeps a dismissed request or draft hidden. Each replay uses new IDs, so the card shows again. */
const replay = ref(0)

function snapshotOf(value: State, run: number): VoiceHostSnapshot {
  const requestId = `story-speech-${run}`
  const draftId = `story-draft-${run}`
  switch (value) {
    case 'capsule':
      return { connected: true, drafts: [], input: { requestId, sessionId: SESSION_ID, phase: 'capturing', text: '', segments: [] } }
    case 'listening':
    case 'finalizing':
      return {
        connected: true,
        drafts: [],
        input: {
          requestId,
          sessionId: SESSION_ID,
          phase: value === 'listening' ? 'capturing' : 'finalizing',
          text: 'there is no meaning to your existence. just let go.',
          segments: [
            { id: `${requestId}-0`, text: 'there is no meaning to your existence. ', final: false },
            { id: `${requestId}-1`, text: 'just let go.', final: false },
          ],
        },
      }
    case 'draft':
      return {
        connected: true,
        drafts: [{ id: draftId, sessionId: SESSION_ID, rawText: 'there is no meaning to your existence just let go', text: 'There is no meaning to your existence. Just let go.' }],
        frontDraftId: draftId,
      }
    case 'long-draft': {
      const text = Array.from({ length: 6 }, (_, index) => `Line ${index + 1} of a long transcript that wraps and makes the draft scroll inside the card.`).join(' ')
      return { connected: true, drafts: [{ id: draftId, sessionId: SESSION_ID, rawText: text, text }], frontDraftId: draftId }
    }
    case 'sent':
      return { connected: true, drafts: [{ id: draftId, sessionId: SESSION_ID, rawText: 'just let go', text: 'Just let go.', sending: true }] }
  }
}

/**
 * Feeds `VoicePresence` with host snapshots, as the voice host does in the desktop app.
 *
 * Histoire mounts the story setup and the variant content in different apps, each with its own Pinia.
 * So the fixture renders inside the variant and writes the voice store of that variant directly.
 * The speech bus is shared by the whole window, so variants that use it cannot show different states.
 */
const VoiceHostFixture = defineComponent({
  name: 'VoiceHostFixture',
  props: {
    view: { type: String as PropType<State>, required: true },
    attempt: { type: Number, required: true },
  },
  setup(props) {
    const controls = useVoiceControlsStore()
    const sessions = useChatSessionStore()
    sessions.sessionMetas[SESSION_ID] = { sessionId: SESSION_ID, userId: 'local', characterId: 'default', title: 'ReLU', createdAt: Date.now(), updatedAt: Date.now() }

    // The level bars move only while the host captures speech, so the fixture feeds a slow wave.
    let phase = 0
    const level = useIntervalFn(() => {
      phase += 0.35
      controls.level = 0.15 + 0.2 * Math.abs(Math.sin(phase))
    }, 50, { immediate: false })

    watch(() => [props.view, props.attempt] as const, ([value, run]) => {
      // A `sent` snapshot only animates out after the card was on screen, so it starts from the draft.
      if (value === 'sent') {
        controls.snapshot = snapshotOf('draft', run)
        setTimeout(() => controls.snapshot = snapshotOf('sent', run), 600)
      }
      else {
        controls.snapshot = snapshotOf(value, run)
      }

      if (value === 'capsule' || value === 'listening')
        level.resume()
      else
        level.pause()
    }, { immediate: true })

    return () => null
  },
})
</script>

<template>
  <Story title="Voice Presence" group="chat" auto-props-disabled :layout="{ type: 'grid', width: 600 }">
    <template #controls>
      <HstSelect v-model="state" title="State" :options="stateOptions" />
      <HstCheckbox v-model="glass" title="Window glass" />
      <HstButton :class="['m-2 px-3 py-1']" @click="replay++">
        Show again (after Escape)
      </HstButton>
    </template>

    <Variant id="inlay" title="Card (State control)">
      <!-- A busy backdrop makes the translucent surface visible. -->
      <div :class="['min-h-80 w-full flex items-end justify-center p-6', 'bg-[linear-gradient(135deg,#0ea5e9_0%,#a855f7_45%,#f97316_100%)]']">
        <!-- The same size and alignment as the desktop inlay window: 520 by 200, anchored to the bottom. -->
        <div
          :class="['h-50 w-130 flex flex-col items-center justify-end px-4 pb-4', 'text-neutral-900 dark:text-neutral-100']"
        >
          <VoicePresence :class="glass ? 'backdrop-blur-xl backdrop-saturate-150' : ''">
            <template #hint>
              <kbd
                :class="[
                  'min-w-6 rounded-md border px-1.5 py-0.5 text-center font-sans text-[11px] leading-none',
                  'border-neutral-900/15 bg-neutral-900/5 text-neutral-600',
                  'dark:border-white/15 dark:bg-white/8 dark:text-neutral-300',
                ]"
              >esc</kbd>
              <span>{{ t('tamagotchi.stage.inlay.dismiss') }}</span>
            </template>
          </VoicePresence>
          <VoiceHostFixture :view="state" :attempt="replay" />
        </div>
      </div>
    </Variant>

    <Variant id="capsule" title="Capsule">
      <div :class="['min-h-80 w-full flex items-end justify-center p-6', 'bg-[linear-gradient(135deg,#0ea5e9_0%,#a855f7_45%,#f97316_100%)]']">
        <div
          :class="['h-50 w-130 flex flex-col items-center justify-end px-4 pb-4', 'text-neutral-900 dark:text-neutral-100']"
        >
          <VoicePresence :class="glass ? 'backdrop-blur-xl backdrop-saturate-150' : ''" />
          <VoiceHostFixture view="capsule" :attempt="replay" />
        </div>
      </div>
    </Variant>
  </Story>
</template>
