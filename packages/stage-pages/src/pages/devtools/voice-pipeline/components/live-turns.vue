<script setup lang="ts">
import type { IOSubsystem } from '@proj-airi/stage-shared'

import type { LiveVoiceHost } from '../composables/use-live-voice-host'
import type { UtteranceAudio } from '../composables/use-utterance-audio'

import { useVoicePushToTalk } from '@proj-airi/stage-ui/composables/voice-input-mode'
import { getSpeechBusContext, voiceInputLevel } from '@proj-airi/stage-ui/services/speech/bus'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useIOTracerStore } from '@proj-airi/stage-ui/stores/devtools/io-tracer'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings/audio-device'
import { useVoiceStore } from '@proj-airi/stage-ui/stores/voice'
import { Button, Callout, FieldCheckbox, FieldInputFile, FieldSelect } from '@proj-airi/ui'
import { useEventListener } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onScopeDispose, ref, shallowRef } from 'vue'

import IOTracerChart from '../../io-tracer/components/io-tracer-chart.vue'
import AsrPanel from './stages/asr-panel.vue'
import EndOfTurnPanel from './stages/end-of-turn-panel.vue'
import LlmPanel from './stages/llm-panel.vue'
import PostAsrPanel from './stages/post-asr-panel.vue'
import TtsPanel from './stages/tts-panel.vue'
import VadPanel from './stages/vad-panel.vue'

import { formatMs, turnStages } from '../composables/turn-stages'
import { isSpokenTurn, voiceInputIdOf, voiceTurnLatency, voiceTurnTiming } from '../composables/turn-timing'
import { useClipInput } from '../composables/use-clip-input'
import { useClipReplay } from '../composables/use-clip-replay'
import { useTurnRecorder } from '../composables/use-turn-recorder'
import { useUtteranceAudio } from '../composables/use-utterance-audio'

const { host, microphoneBusy, rolloutsBusy, rolloutsStatus } = defineProps<{
  /** The page owns the host, because the offline lab must not record while the host takes speech. */
  host: LiveVoiceHost
  /** The offline lab records from the microphone now. A host that starts then also takes that speech. */
  microphoneBusy: boolean
  /** Why the offline lab cannot probe now, for example because its decoders are busy. */
  rolloutsBusy?: string
  /** What the offline lab probe does now. */
  rolloutsStatus?: string
}>()

const emit = defineEmits<{
  /** A selected turn has audio. The page offers it to the offline lab as the clip. */
  selectUtterance: [utterance: UtteranceAudio, label: string]
  /** Probes the audio of a turn in the offline lab. */
  runRollouts: [utterance: UtteranceAudio, label: string]
}>()

/** The voice pipeline runs at 16 kHz, so a replayed clip is converted to it once, when it loads. */
const sampleRate = 16000

const voice = useVoiceStore()
const hearing = useHearingStore()
const devices = useSettingsAudioDevice()
const sessions = useChatSessionStore()
const { inputMode, autoSendEnabled } = storeToRefs(hearing)
const { enabled: microphoneEnabled } = storeToRefs(devices)

const pushToTalk = useVoicePushToTalk()
const clip = useClipInput(sampleRate)
const replay = useClipReplay()
/** A recorder of this page uses the microphone. The host must not start or change how it listens, or it takes that speech too. */
const diagnosticRecording = computed(() => microphoneBusy || !!clip.recording.value)
/** A recording or a replay runs. The replay keeps the input mode of its start, so the listening settings must not change. */
const inputLocked = computed(() => diagnosticRecording.value || !!replay.replaying.value)

// The button sees no pointer release after the page loses focus, so the hold is cancelled then, as for the hold key.
useEventListener(window, 'blur', () => pushToTalk.cancel('Page lost focus during the hold'))
useEventListener(document, 'visibilitychange', () => {
  if (document.visibilityState === 'hidden')
    pushToTalk.cancel('Page was hidden during the hold')
})

// Stopping the host cancels the input that a replay holds, so the replay stops with it and returns the microphone.
function stopHost() {
  replay.stop()
  host.stop()
}

const inputModeOptions = [
  { value: 'always-on', label: 'Always on', description: 'Voice activity detection starts and ends each input.' },
  { value: 'push-to-talk', label: 'Push to Talk', description: 'Hold the button below. A replayed clip holds it for its length.' },
  { value: 'wake-word', label: 'Wake word', description: 'A wake word starts the input. A replayed clip cannot wake, so it holds the input like Push to Talk.' },
]

const { userId } = storeToRefs(useAuthStore())
/**
 * The chats of the signed-in user, newest first. Each window keeps its own chat selection, so the main
 * window's selection does not reach a devtool window. The page selects its own target chat here.
 */
const chatOptions = computed(() => Object.values(sessions.sessionMetas)
  .filter(meta => meta.userId === (userId.value || 'local'))
  .toSorted((a, b) => b.updatedAt - a.updatedAt)
  .map(meta => ({ value: meta.sessionId, label: meta.title || meta.sessionId })))
const targetChat = computed({
  get: () => sessions.activeSessionId,
  set: sessionId => void sessions.setActiveSession(sessionId),
})

const phase = computed(() => voice.state?.phase ?? 'idle')
const liveText = computed(() => voice.transcript?.transcript.text ?? '')

// The voice host publishes the level while an input captures from the microphone. It sends no level when the
// capture ends, so the bar shows the level only while the input captures.
const lastLevel = ref(0)
onScopeDispose(getSpeechBusContext().on(voiceInputLevel, ({ body }) => {
  if (body)
    lastLevel.value = body.level
}))
const level = computed(() => phase.value === 'capturing' ? lastLevel.value : 0)

// Timeline

const tracer = useIOTracerStore()
const { turns, selectedSpanId, recordingStartTs } = storeToRefs(tracer)
// The IO tracer page can be recording already, in another view of the same store. Only a recording that this view
// started stops with it.
const ownsRecording = !tracer.isRecording
tracer.startRecording()
onScopeDispose(() => {
  if (ownsRecording)
    tracer.stopRecording()
})
const hiddenSubsystems = shallowRef(new Set<IOSubsystem>())

const spokenTurns = computed(() => turns.value
  .filter(isSpokenTurn)
  .map((turn) => {
    const timing = voiceTurnTiming(turn)
    return { turn, timing, latency: voiceTurnLatency(timing) }
  })
  .reverse())

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString()
}

const utterances = useUtteranceAudio()
const playbackNote = ref<string>()

/** Selects a span. A span of a spoken turn also plays the utterance of that turn and sends it to the offline lab. */
function selectSpan(spanId: string | null) {
  tracer.selectSpan(spanId)
  utterances.stop()
  playbackNote.value = undefined
  const turn = spanId ? turns.value.find(candidate => candidate.spans.some(span => span.id === spanId)) : undefined
  const inputId = turn && voiceInputIdOf(turn)
  if (!turn || !inputId)
    return

  const utterance = utterances.utterances.get(inputId)
  if (!utterance) {
    playbackNote.value = 'This turn has no audio on this page. Only turns that this page captured have audio, not turns of another window or from before the page opened.'
    return
  }
  utterances.play(inputId)
  emit('selectUtterance', utterance, `the turn at ${formatTime(turn.startTs)}`)
}

function selectTurn(turnId: string) {
  const turn = turns.value.find(candidate => candidate.id === turnId)
  selectSpan(turn?.spans[0]?.id ?? null)
}

// Stage panels

const recorder = useTurnRecorder()
/** The turn of the selected span, or else the newest spoken turn, so the panels follow live turns. */
const selected = computed(() => {
  const id = selectedSpanId.value
  const turn = id ? turns.value.find(candidate => candidate.spans.some(span => span.id === id)) : undefined
  return spokenTurns.value.find(item => item.turn === turn) ?? spokenTurns.value[0]
})
const selectedStages = computed(() => selected.value && turnStages(selected.value.turn))
const selectedInputId = computed(() => selected.value && voiceInputIdOf(selected.value.turn))
const selectedRecord = computed(() => selectedInputId.value ? recorder.records.get(selectedInputId.value) : undefined)
const selectedContext = computed(() => selectedInputId.value ? recorder.speechContextOf(selectedInputId.value) : undefined)
const selectedLabel = computed(() => selected.value && `the turn at ${formatTime(selected.value.turn.startTs)}`)
const selectedAudio = computed(() => selectedInputId.value ? utterances.utterances.get(selectedInputId.value) : undefined)
const rolloutsBlocked = computed(() => selectedAudio.value ? rolloutsBusy : 'This turn has no audio on this page.')
function runRollouts() {
  if (selectedAudio.value && selectedLabel.value)
    emit('runRollouts', selectedAudio.value, selectedLabel.value)
}

const panels = [
  { id: 'vad', title: 'Speech detection' },
  { id: 'asr', title: 'Speech recognition' },
  { id: 'end', title: 'End of turn and interruption' },
  { id: 'post', title: 'Post-ASR' },
  { id: 'llm', title: 'Reply' },
  { id: 'tts', title: 'Speech output' },
] as const
</script>

<template>
  <section :class="['flex flex-col gap-4']">
    <h2 :class="['text-lg font-semibold']">
      Live turns
    </h2>
    <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
      Runs whole voice turns through the production pipeline: speech detection, recognition, the reply in the active chat, and speech output.
      The settings below are the Hearing settings of the app.
    </p>

    <div :class="['flex flex-wrap items-center gap-3']">
      <Button
        v-if="!host.running.value"
        variant="primary"
        icon="i-solar:play-bold"
        label="Start the voice host"
        :disabled="diagnosticRecording"
        @click="host.start()"
      />
      <Button v-else icon="i-solar:stop-bold" label="Stop the voice host" @click="stopHost()" />
      <span v-if="!host.running.value && diagnosticRecording" :class="['text-sm text-neutral-500 dark:text-neutral-400']">
        Stop the microphone recording first, because the host takes that speech as a turn too.
      </span>
      <span v-if="host.running.value" :class="['text-sm text-neutral-500 dark:text-neutral-400']">
        This page listens and plays the replies now. Other windows, such as the main window, stop listening until this host stops. Leaving the page stops the host.
      </span>
    </div>
    <Callout v-if="host.error.value" theme="orange" label="The voice host could not start">
      <p>{{ host.error.value }}</p>
    </Callout>
    <Callout v-if="!hearing.configured" theme="orange" label="No Hearing provider">
      <p>Set up a transcription provider in the Hearing settings. Without it, speech starts no input.</p>
    </Callout>

    <div :class="['grid gap-4 md:grid-cols-2']">
      <FieldSelect v-model="inputMode" label="Input mode" :options="inputModeOptions" :disabled="inputLocked" />
      <FieldCheckbox
        v-model="microphoneEnabled"
        label="Microphone input"
        :description="inputLocked
          ? 'Stop the recording or the replay first. A change here changes how the host listens while they run.'
          : 'The microphone stays open in Always on and Wake word mode. In Push to Talk mode, it opens only while you hold the button.'"
        :disabled="inputLocked"
      />
      <FieldCheckbox
        v-model="autoSendEnabled"
        label="Send each turn to the chat"
        description="Off is a dry run: each turn stays a draft below, and you send or discard it."
      />
      <FieldSelect
        v-model="targetChat"
        label="Chat"
        :description="chatOptions.length ? 'Turns go to this chat. It is the selection of this window only.' : 'There is no chat yet. Open one on the main page first.'"
        :options="chatOptions"
      />
    </div>

    <div :class="['flex flex-wrap items-center gap-4']">
      <Button
        v-if="inputMode !== 'always-on'"
        icon="i-solar:microphone-3-bold-duotone"
        :label="pushToTalk.held.value ? 'Release to send' : 'Hold to talk'"
        :disabled="!host.running.value || !pushToTalk.enabled.value || inputLocked"
        @pointerdown="pushToTalk.press()"
        @pointerup="pushToTalk.release()"
        @pointerleave="pushToTalk.release()"
        @pointercancel="pushToTalk.cancel('Pointer was cancelled during the hold')"
      />
      <div :class="['flex items-center gap-2 text-sm']">
        <span :class="['text-neutral-500 dark:text-neutral-400']">Input</span>
        <span :class="['font-mono']">{{ phase }}</span>
        <div :class="['h-2 w-24 overflow-hidden rounded bg-neutral-200 dark:bg-neutral-700']">
          <div :class="['h-full bg-primary-500 transition-all duration-100']" :style="{ width: `${Math.round(Math.min(1, level) * 100)}%` }" />
        </div>
      </div>
      <span v-if="liveText" :class="['text-sm']">{{ liveText }}</span>
    </div>

    <div :class="['grid gap-4 md:grid-cols-2']">
      <FieldInputFile
        v-model="clip.files.value"
        label="Clip to replay"
        description="Any format the browser can decode. The clip goes into the pipeline in real time, in place of the microphone."
        accept="audio/*"
      />
      <div :class="['flex flex-col gap-2']">
        <div :class="['text-sm font-medium']">
          Record a clip
        </div>
        <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
          Records without echo cancellation, noise suppression, or gain control. Replay it to repeat the same turn.
          <template v-if="host.recordingBlocked.value">
            {{ host.recordingBlocked.value }}
          </template>
        </div>
        <div>
          <Button v-if="!clip.recording.value" icon="i-solar:microphone-3-bold-duotone" label="Record" :disabled="!!host.recordingBlocked.value" @click="clip.record" />
          <Button v-else icon="i-solar:stop-bold" color="red" label="Stop" @click="clip.stop" />
        </div>
      </div>
    </div>
    <p v-if="clip.error.value" :class="['text-sm text-red-500']">
      {{ clip.error.value }}
    </p>
    <div :class="['flex flex-wrap items-center gap-3']">
      <Button
        v-if="!replay.replaying.value"
        icon="i-solar:play-bold"
        label="Replay the clip"
        :disabled="!host.running.value || !clip.clip.value"
        @click="replay.replay(clip.clip.value!, sampleRate)"
      />
      <Button v-else icon="i-solar:stop-bold" label="Stop the replay" @click="replay.stop()" />
      <span v-if="clip.clip.value" :class="['text-sm text-neutral-500 dark:text-neutral-400']">
        {{ (clip.clip.value.length / sampleRate).toFixed(1) }} s
      </span>
      <span v-if="replay.error.value" :class="['text-sm text-red-500']">{{ replay.error.value }}</span>
    </div>

    <div v-if="voice.drafts.length" :class="['flex flex-col gap-2']">
      <div :class="['text-sm font-medium']">
        Drafts
      </div>
      <div
        v-for="draft in voice.drafts"
        :key="draft.id"
        :class="['flex flex-wrap items-center gap-3 rounded-lg border border-neutral-200 p-2 text-sm dark:border-neutral-700']"
      >
        <span :class="['flex-1']">{{ draft.text || '(empty)' }}</span>
        <Button size="sm" variant="primary" label="Send" :disabled="!draft.text" @click="voice.sendDraft(draft.id)" />
        <Button size="sm" label="Discard" @click="voice.discardDraft(draft.id)" />
      </div>
    </div>

    <div :class="['flex flex-col gap-2']">
      <div :class="['flex items-center gap-3']">
        <div :class="['text-sm font-medium']">
          Turns
        </div>
        <Button size="sm" label="Clear" :disabled="!turns.length" @click="tracer.clear()" />
      </div>
      <p :class="['text-xs text-neutral-500 dark:text-neutral-400']">
        Click a row or a span of a spoken turn to play what the speech recognition heard. It also becomes the clip of the offline lab below.
        Swipe up and down to scroll the timeline. Pinch, or hold Ctrl and scroll, to zoom.
      </p>
      <p v-if="playbackNote" :class="['text-xs text-amber-600 dark:text-amber-400']">
        {{ playbackNote }}
      </p>
      <table v-if="spokenTurns.length" :class="['w-full text-left text-sm']">
        <thead :class="['text-xs text-neutral-500 dark:text-neutral-400']">
          <tr>
            <th :class="['py-1 pr-3 font-normal']">
              Time
            </th>
            <th :class="['py-1 pr-3 font-normal']">
              Transcript
            </th>
            <th :class="['py-1 pr-3 font-normal']">
              Outcome
            </th>
            <th :class="['py-1 pr-3 font-normal']" title="From the end of speech to the final transcript">
              Transcript after
            </th>
            <th :class="['py-1 pr-3 font-normal']" title="From the end of speech to the first token of the reply">
              First token after
            </th>
            <th :class="['py-1 font-normal']" title="From the end of speech to the first reply audio">
              First audio after
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="{ turn, timing, latency } in spokenTurns"
            :key="turn.id"
            :class="['cursor-pointer border-t border-neutral-200 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800']"
            @click="selectTurn(turn.id)"
          >
            <td :class="['py-1 pr-3 font-mono']">
              {{ formatTime(turn.startTs) }}
            </td>
            <td :class="['py-1 pr-3']">
              {{ turn.inputText || '—' }}
            </td>
            <td :class="['py-1 pr-3']">
              {{ timing.outcome ?? 'running' }}
            </td>
            <td :class="['py-1 pr-3 font-mono']">
              {{ formatMs(latency.transcriptMs) }}
            </td>
            <td :class="['py-1 pr-3 font-mono']">
              {{ formatMs(latency.firstTokenMs) }}
            </td>
            <td :class="['py-1 font-mono']">
              {{ formatMs(latency.firstAudioMs) }}
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else :class="['text-sm text-neutral-500 dark:text-neutral-400']">
        No spoken turn yet. Start the voice host, then speak or replay a clip.
      </p>
      <div :class="['flex h-96 overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700']">
        <IOTracerChart
          :turns="turns"
          :selected-span-id="selectedSpanId"
          :time-origin="recordingStartTs"
          :hidden-subsystems="hiddenSubsystems"
          @select-span="selectSpan($event)"
        />
      </div>
    </div>

    <div :class="['flex flex-col gap-2']">
      <div :class="['text-sm font-medium']">
        Stages
      </div>
      <p :class="['text-xs text-neutral-500 dark:text-neutral-400']">
        <template v-if="selectedLabel">
          The panels show {{ selectedLabel }}. Select another turn above.
        </template>
        <template v-else>
          The panels show the selected turn. Start the voice host and speak to make one.
        </template>
      </p>
      <div :class="['grid gap-4 xl:grid-cols-2']">
        <section
          v-for="panel in panels"
          :key="panel.id"
          :class="['flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-700']"
        >
          <h3 :class="['font-semibold']">
            {{ panel.title }}
          </h3>
          <VadPanel v-if="panel.id === 'vad'" :stages="selectedStages" />
          <AsrPanel
            v-else-if="panel.id === 'asr'"
            :stages="selectedStages"
            :record="selectedRecord"
            :speech-end-ts="selected?.timing.speechEndTs"
            :rollouts-blocked="rolloutsBlocked"
            :rollouts-status="rolloutsStatus"
            @run-rollouts="runRollouts"
          />
          <EndOfTurnPanel v-else-if="panel.id === 'end'" :turn="selected?.turn" :stages="selectedStages" :turns="turns" />
          <PostAsrPanel v-else-if="panel.id === 'post'" :stages="selectedStages" :record="selectedRecord" :speech-context="selectedContext" />
          <LlmPanel v-else-if="panel.id === 'llm'" :stages="selectedStages" :record="selectedRecord" :speech-end-ts="selected?.timing.speechEndTs" />
          <TtsPanel v-else :stages="selectedStages" :session-id="selectedRecord?.submission?.sessionId" />
        </section>
      </div>
    </div>
  </section>
</template>
