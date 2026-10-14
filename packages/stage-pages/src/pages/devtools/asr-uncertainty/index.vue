<script setup lang="ts">
import type { AnalysisOptions, NucleusOptions, ProbeNoise, ProbeResult, UncertainSpan, UntranscribedOptions } from '@proj-airi/stage-ui/libs/voice/asr-uncertainty'

import type { ProbeRunSettings } from './composables/use-uncertainty-probe'

import { errorMessageFrom } from '@moeru/std'
import { fileSource, Pcm16Encoder, toFloat32FromPCM16, toWav } from '@proj-airi/audio/encoding'
import { xAsrBilingualZhEnInt8 } from '@proj-airi/provider-inference'
import { availableSherpawModels } from '@proj-airi/stage-ui/libs/providers/providers/sherpaw/model-resources'
import {
  analyzeHypotheses,
  defaultAnalysisOptions,
  defaultNucleusOptions,
  defaultUntranscribedOptions,
  findUntranscribedSpeech,
  formatForLlm,
  joinTokens,
  measureIntensity,
} from '@proj-airi/stage-ui/libs/voice/asr-uncertainty'
import { Button, Callout, FieldInputFile, FieldRange, FieldSelect, Progress } from '@proj-airi/ui'
import { useObjectUrl } from '@vueuse/core'
import { computed, onBeforeUnmount, reactive, ref, shallowRef, useTemplateRef, watch } from 'vue'

import UncertaintyTimeline from './components/uncertainty-timeline.vue'

import { microphoneChunks, replayChunks } from './composables/audio-chunks'
import { useLiveProbe } from './composables/use-live-probe'
import { useProbeDecoders } from './composables/use-probe-decoders'
import { useUncertaintyProbe } from './composables/use-uncertainty-probe'

/** Every Sherpaw model in AIRI runs at 16 kHz. Clips are converted to this rate once, when they load. */
const sampleRate = 16000

/** Clips longer than this make a run slow, because each decode takes about as long as the clip. */
const longClipSeconds = 12

/** Live lag above this is shown. Smaller lag comes from block delivery and decoding one block. */
const lagWarningSeconds = 0.5

const models = availableSherpawModels
const modelOptions = models.map(model => ({
  value: model.id,
  label: model.name,
  description: model.recognizer === 'paraformer' ? 'No token times. Only the text alignment works.' : 'Reports token times.',
}))
// X-ASR is the desktop default of Hearing for Chinese and English, and it reports token times.
const modelId = ref(models.find(model => model.id === xAsrBilingualZhEnInt8.id)?.id ?? models.find(model => model.recognizer === 'transducer')?.id ?? '')

const run = reactive({
  noise: 'encoder' as ProbeNoise,
  // 1 encoder-output standard deviation matched 12 input-noise decodes on a 50-clip benchmark.
  sigma: 1,
  count: 12,
  firstCount: 3,
  snrMinDb: 8,
  snrMaxDb: 25,
  maxShiftMs: 40,
  // Speed and pitch changes rarely change the transcript. Noise does.
  speedSpreadPercent: 0,
  seed: 1,
  blankPenalty: 2,
  // Two cores stay free for the page and the audio input.
  workers: Math.min(4, Math.max(1, (navigator.hardwareConcurrency ?? 2) - 2)),
})
const analysisOptions = reactive<AnalysisOptions>({ ...defaultAnalysisOptions })
const nucleusOptions = reactive<NucleusOptions>({ ...defaultNucleusOptions })
const untranscribedOptions = reactive<UntranscribedOptions>({ ...defaultUntranscribedOptions })

const clip = shallowRef<Float32Array<ArrayBuffer>>()
const clipError = ref<string>()
const files = ref<File[]>()
const recording = shallowRef<AbortController>()

const clipSeconds = computed(() => (clip.value?.length ?? 0) / sampleRate)
const clipBlob = computed(() => clip.value ? new Blob([toWav(clip.value.buffer, sampleRate)], { type: 'audio/wav' }) : undefined)
const clipUrl = useObjectUrl(clipBlob)

function concat(parts: readonly Float32Array[]) {
  const output = new Float32Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}

/** The read of the last selected file. A new selection aborts it, so an older file cannot replace a newer one. */
let fileRead: AbortController | undefined

watch(files, async (selected) => {
  const file = selected?.[0]
  if (!file)
    return
  fileRead?.abort()
  const controller = new AbortController()
  fileRead = controller
  const { signal } = controller
  clipError.value = undefined
  try {
    const reader = new Pcm16Encoder(fileSource(file).open(signal), { sampleRate, signal }).stream.getReader()
    const parts: Float32Array[] = []
    for (;;) {
      const { done, value } = await reader.read()
      if (done)
        break
      parts.push(toFloat32FromPCM16(value))
    }
    if (!signal.aborted)
      clip.value = concat(parts)
  }
  catch (error) {
    if (!signal.aborted)
      clipError.value = errorMessageFrom(error) ?? 'Could not read the file.'
  }
})

async function startRecording() {
  clipError.value = undefined
  const controller = new AbortController()
  recording.value = controller
  try {
    const parts: Float32Array[] = []
    for await (const part of microphoneChunks(sampleRate, controller.signal))
      parts.push(part)
    clip.value = concat(parts)
  }
  catch (error) {
    clipError.value = errorMessageFrom(error) ?? 'Could not record from the microphone.'
  }
  finally {
    recording.value = undefined
  }
}

const decoders = useProbeDecoders()
const probe = useUncertaintyProbe(decoders)
const live = useLiveProbe(decoders)

const progressPercent = computed(() => probe.progress.value.total === 0 ? 0 : 100 * probe.progress.value.done / probe.progress.value.total)
const busy = computed(() => probe.status.value === 'loading' || probe.status.value === 'decoding')
const listening = computed(() => live.status.value === 'loading' || live.status.value === 'listening')
/** A new model or pool size replaces the Workers, which drops their pending decodes. */
const decodersInUse = computed(() => busy.value || listening.value)

const selectedModel = computed(() => models.find(candidate => candidate.id === modelId.value))
/** Encoder noise needs a transducer. Other models fall back to input noise, and the select shows the fallback. */
const noise = computed<ProbeNoise>({
  get: () => selectedModel.value?.recognizer === 'transducer' ? run.noise : 'input',
  set: (value) => {
    run.noise = value
  },
})
const noiseOptions = [
  { value: 'encoder', label: 'Encoder output', description: 'Encodes once and adds noise to the encoder output. Each rollout costs about a tenth of a decode. Transducers only.' },
  { value: 'input', label: 'Input audio', description: 'Adds noise to the audio and decodes each copy again.' },
]

function runSettings(): ProbeRunSettings | undefined {
  const model = selectedModel.value
  if (!model)
    return undefined
  const speedSpread = run.speedSpreadPercent / 100
  return {
    model,
    workers: run.workers,
    sampleRate,
    noise: noise.value,
    sigma: run.sigma,
    count: run.count,
    firstCount: run.firstCount,
    ranges: {
      snrDb: [Math.min(run.snrMinDb, run.snrMaxDb), Math.max(run.snrMinDb, run.snrMaxDb)],
      shiftMs: [0, run.maxShiftMs],
      speed: [1 - speedSpread, 1 + speedSpread],
    },
    seed: run.seed,
    blankPenalty: model.recognizer === 'transducer' ? run.blankPenalty : 0,
  }
}

/** The utterance whose result the Result section shows. Undefined shows the clip result. */
const selectedUtteranceId = ref<number>()

function startProbe() {
  const settings = runSettings()
  if (!clip.value || !settings)
    return
  selectedUtteranceId.value = undefined
  void probe.run(clip.value, settings)
}

const liveSource = ref<'microphone' | 'clip'>('microphone')
const liveSourceOptions = [
  { value: 'microphone', label: 'Microphone', description: 'Without echo cancellation, noise suppression, or gain control.' },
  { value: 'clip', label: 'Loaded clip', description: 'Plays the clip into the live decoder at real-time speed.' },
]

function startLive() {
  const settings = runSettings()
  const replayed = clip.value
  if (!settings || (liveSource.value === 'clip' && !replayed))
    return
  selectedUtteranceId.value = undefined
  const chunks = liveSource.value === 'clip' && replayed
    ? (signal: AbortSignal) => replayChunks(replayed, sampleRate, signal)
    : (signal: AbortSignal) => microphoneChunks(sampleRate, signal)
  void live.start(chunks, {
    ...settings,
    selection: { nucleus: { ...nucleusOptions }, minNuclei: untranscribedOptions.minNuclei, marginSeconds: 0.3 },
  })
}

/** Analysis reruns on every threshold change. The decodes stay as they are. */
function annotate(result: ProbeResult) {
  const analysis = analyzeHypotheses(result.reference, result.samples.map(sample => sample.hypothesis), result.durationSeconds, { ...analysisOptions })
  const contour = measureIntensity(result.clip, sampleRate, { ...nucleusOptions })
  const spans: UncertainSpan[] = [
    ...analysis.spans,
    ...findUntranscribedSpeech(contour, result.reference, { ...untranscribedOptions }, result.probe),
  ].toSorted((a, b) => (a.start ?? a.tokenStart) - (b.start ?? b.tokenStart))
  return { analysis, contour, spans, llmText: formatForLlm(result.reference, spans) }
}

const liveTexts = computed(() => new Map(live.utterances.value.flatMap(utterance => utterance.result ? [[utterance.id, annotate(utterance.result).llmText] as const] : [])))

const shown = computed(() => {
  const utterance = live.utterances.value.find(candidate => candidate.id === selectedUtteranceId.value)
  return selectedUtteranceId.value === undefined ? probe.result.value : utterance?.result
})
const annotation = computed(() => shown.value ? annotate(shown.value) : undefined)
const shownBlob = computed(() => shown.value ? new Blob([toWav(new Float32Array(shown.value.clip).buffer, sampleRate)], { type: 'audio/wav' }) : undefined)
const shownUrl = useObjectUrl(shownBlob)
const player = useTemplateRef<HTMLAudioElement>('player')

function referenceText(span: UncertainSpan) {
  const tokens = shown.value?.reference.tokens.slice(span.tokenStart, span.tokenEnd) ?? []
  return joinTokens(tokens.map(token => token.text))
}

function play(seconds: number) {
  if (!player.value)
    return
  player.value.currentTime = Math.max(0, seconds)
  void player.value.play()
}

function agreementLabel(value: number | undefined) {
  return value === undefined ? '-' : value.toFixed(2)
}

function utteranceStatus(utterance: (typeof live.utterances.value)[number]) {
  if (utterance.status === 'error')
    return utterance.error ?? 'Failed'
  if (utterance.status === 'waiting')
    return 'Waiting for the rollouts'
  return `${utterance.result?.samples.length ?? 0} rollouts, ready ${utterance.latency?.toFixed(1) ?? '-'} s after the endpoint`
}

onBeforeUnmount(() => recording.value?.abort())
</script>

<template>
  <div :class="['flex flex-col gap-6 pb-12']">
    <Callout label="What this measures">
      <p>
        The probe decodes the clip once as the reference, then many rollouts with noise. Encoder noise reuses the reference's encoder output, so it is about ten times cheaper than input noise.
        Input noise can also add a small time shift and a small speed change, but they rarely change the transcript.
        Tokens that the copies do not reproduce at the same audio time are unstable. Speech that the copies hear but the reference drops is a deletion.
        Syllable nuclei with no token near them are untranscribed speech. An elongated sound adds no nucleus, so it does not count.
      </p>
    </Callout>

    <section :class="['flex flex-col gap-4']">
      <h2 :class="['text-lg font-semibold']">
        Clip
      </h2>
      <div :class="['grid gap-4 md:grid-cols-2']">
        <FieldInputFile v-model="files" label="Audio file" description="Any format the browser can decode. It is converted to 16 kHz mono." accept="audio/*" />
        <div :class="['flex flex-col gap-2']">
          <div :class="['text-sm font-medium']">
            Microphone
          </div>
          <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
            Records without echo cancellation, noise suppression, or gain control, so the probe sees the raw input.
          </div>
          <div>
            <Button v-if="!recording" icon="i-solar:microphone-3-bold-duotone" label="Record" :disabled="listening" @click="startRecording" />
            <Button v-else icon="i-solar:stop-bold" color="red" label="Stop" @click="recording.abort()" />
          </div>
        </div>
      </div>
      <p v-if="clipError" :class="['text-sm text-red-500']">
        {{ clipError }}
      </p>
      <div v-if="clip" :class="['flex flex-wrap items-center gap-4 text-sm']">
        <audio :src="clipUrl" controls />
        <span>{{ clipSeconds.toFixed(1) }} s</span>
        <span v-if="clipSeconds > longClipSeconds" :class="['text-amber-600 dark:text-amber-400']">
          Long clip. Each decode takes about as long as the clip, so trim it for faster runs.
        </span>
      </div>
    </section>

    <section :class="['flex flex-col gap-4']">
      <h2 :class="['text-lg font-semibold']">
        Run
      </h2>
      <fieldset :disabled="decodersInUse" :class="['flex flex-col gap-4']">
        <FieldSelect v-model="modelId" label="Model" description="Downloads the model when it is not installed yet." :options="modelOptions" :disabled="decodersInUse" />
        <FieldRange
          v-model="run.workers"
          label="Decoder Workers"
          description="Decodes that run at the same time. Each Worker holds its own copy of the model, so each one adds about the model size in memory. The Workers keep the model loaded between runs."
          :min="1" :max="8" :step="1"
        />
      </fieldset>
      <div :class="['grid gap-4 md:grid-cols-2']">
        <FieldSelect v-model="noise" label="Noise" :options="noiseOptions" :disabled="selectedModel?.recognizer !== 'transducer'" />
        <FieldRange v-model="run.count" label="Rollouts" :min="2" :max="64" :step="1" />
        <FieldRange
          v-if="noise === 'encoder'"
          v-model="run.sigma"
          label="Noise scale"
          description="Standard deviation of the noise, in standard deviations of the encoder output."
          :min="0.25" :max="2" :step="0.05" :format-value="value => `${value.toFixed(2)} σ`"
        />
        <FieldRange
          v-if="noise === 'input'"
          v-model="run.firstCount"
          label="Early stop after"
          description="These decodes run first. The others run only when one of them hears other words than the reference, or a word at another time. 0 runs all of them. Clip only."
          :min="0" :max="8" :step="1"
        />
        <template v-if="noise === 'input'">
          <FieldRange v-model="run.snrMinDb" label="Lowest SNR" :min="0" :max="40" :step="1" :format-value="value => `${value} dB`" />
          <FieldRange v-model="run.snrMaxDb" label="Highest SNR" :min="0" :max="40" :step="1" :format-value="value => `${value} dB`" />
          <FieldRange v-model="run.maxShiftMs" label="Largest time shift" description="Moves the chunk boundaries of streaming models. Clip only." :min="0" :max="200" :step="5" :format-value="value => `${value} ms`" />
          <FieldRange v-model="run.speedSpreadPercent" label="Speed spread" description="Also changes the pitch. Clip only." :min="0" :max="10" :step="0.5" :format-value="value => `±${value}%`" />
        </template>
        <FieldRange v-model="run.seed" label="Seed" description="The same seed repeats the same perturbations." :min="1" :max="100" :step="1" />
        <FieldRange
          v-model="run.blankPenalty"
          label="Blank penalty probe"
          description="One extra decode that emits more tokens. Its words fill untranscribed spans. 0 skips it. Transducers only."
          :min="0" :max="6" :step="0.5"
        />
      </div>
      <div :class="['flex flex-wrap items-center gap-4']">
        <Button variant="primary" color="primary" icon="i-solar:play-bold" label="Probe the clip" :disabled="!clip || busy || listening || !modelId" @click="startProbe" />
        <Button v-if="busy" label="Stop" @click="probe.cancel()" />
        <span v-if="probe.status.value === 'loading'" :class="['text-sm']">Loading the model...</span>
        <span v-if="probe.status.value === 'decoding'" :class="['text-sm']">Decode {{ probe.progress.value.done }} of {{ probe.progress.value.total }}</span>
        <span v-if="probe.status.value === 'done' && probe.result.value?.stoppedEarly" :class="['text-sm text-neutral-500']">
          The first {{ probe.result.value.samples.length }} decodes matched the reference, so the others did not run.
        </span>
      </div>
      <Progress v-if="busy" :progress="progressPercent" />
      <p v-if="probe.error.value" :class="['text-sm text-red-500']">
        {{ probe.error.value }}
      </p>
    </section>

    <section :class="['flex flex-col gap-4']">
      <h2 :class="['text-lg font-semibold']">
        Live
      </h2>
      <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
        The Workers decode the input as it arrives: one clean stream, the rollouts, and the blank penalty stream. Encoder rollouts follow the clean stream in its Worker. Each input rollout is a stream with its own noise.
        Each endpoint of the clean stream cuts every stream at the same input, so the probe is ready when the slowest Worker reaches the endpoint.
        Live mode adds noise only. A segment without words is probed only when it holds syllables as loud as earlier speech, because the model can delete a whole utterance.
      </div>
      <FieldSelect v-model="liveSource" label="Input" :options="liveSourceOptions" :disabled="listening" />
      <div :class="['flex flex-wrap items-center gap-4']">
        <Button
          v-if="!listening"
          variant="primary" color="primary" icon="i-solar:soundwave-bold-duotone" label="Start"
          :disabled="!modelId || busy || recording !== undefined || (liveSource === 'clip' && !clip)"
          @click="startLive"
        />
        <Button v-else icon="i-solar:stop-bold" color="red" label="Stop" @click="live.stop()" />
        <span v-if="live.status.value === 'loading'" :class="['text-sm']">Loading the model...</span>
        <span v-if="live.status.value === 'listening'" :class="['text-sm text-neutral-500']">Listening</span>
        <span v-if="live.status.value === 'listening' && live.lag.value > lagWarningSeconds" :class="['text-sm text-amber-600 dark:text-amber-400']">
          The Workers are {{ live.lag.value.toFixed(1) }} s behind the input. Use fewer perturbed decodes or more Workers.
        </span>
      </div>
      <p v-if="live.error.value" :class="['text-sm text-red-500']">
        {{ live.error.value }}
      </p>
      <p v-if="live.partial.value" :class="['text-sm italic text-neutral-500']">
        {{ live.partial.value }}
      </p>
      <button
        v-for="utterance in live.utterances.value"
        :key="utterance.id"
        type="button"
        :disabled="!utterance.result"
        :class="[
          'flex flex-col gap-1 rounded-lg p-2 text-left text-sm',
          'bg-neutral-100 dark:bg-neutral-800',
          'enabled:hover:bg-neutral-200 dark:enabled:hover:bg-neutral-700',
          { 'ring-2 ring-primary-400': selectedUtteranceId === utterance.id },
        ]"
        @click="selectedUtteranceId = utterance.id"
      >
        <span :class="['font-mono text-xs text-neutral-500']">
          {{ utterance.start.toFixed(1) }}-{{ utterance.end.toFixed(1) }} s · {{ utteranceStatus(utterance) }}
        </span>
        <span>{{ liveTexts.get(utterance.id) ?? (utterance.liveText || '(no words)') }}</span>
      </button>
    </section>

    <section v-if="shown && annotation" :class="['flex flex-col gap-4']">
      <h2 :class="['text-lg font-semibold']">
        Result
      </h2>
      <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
        Click the chart to play from that point. Span colors: amber is unstable, red is dropped, violet is untranscribed.
      </div>
      <audio ref="player" :src="shownUrl" controls />
      <UncertaintyTimeline
        :duration-seconds="shown.durationSeconds"
        :contour="annotation.contour"
        :tokens="annotation.analysis.tokens"
        :timeline="annotation.analysis.timeline"
        :spans="annotation.spans"
        :probe-tokens="shown.probe?.tokens"
        :agreement-threshold="analysisOptions.agreementThreshold"
        @seek="play"
      />

      <div :class="['flex flex-col gap-2']">
        <div :class="['text-sm font-medium']">
          What the LLM would read
        </div>
        <pre :class="['whitespace-pre-wrap rounded-lg p-3 text-sm', 'bg-neutral-100 dark:bg-neutral-800']">{{ annotation.llmText }}</pre>
      </div>

      <div :class="['flex flex-col gap-2']">
        <div :class="['text-sm font-medium']">
          Spans
        </div>
        <p v-if="annotation.spans.length === 0" :class="['text-sm text-neutral-500']">
          No spans at these thresholds.
        </p>
        <button
          v-for="(span, index) in annotation.spans"
          :key="index"
          type="button"
          :class="['flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg p-2 text-left text-sm', 'bg-neutral-100 dark:bg-neutral-800', 'hover:bg-neutral-200 dark:hover:bg-neutral-700']"
          @click="play(span.start ?? 0)"
        >
          <span :class="['font-mono text-xs', { 'text-amber-600': span.kind === 'unstable', 'text-red-600': span.kind === 'dropped', 'text-violet-600': span.kind === 'untranscribed' }]">{{ span.kind }}</span>
          <span v-if="span.start !== undefined && span.end !== undefined" :class="['font-mono text-xs text-neutral-500']">{{ span.start.toFixed(2) }}-{{ span.end.toFixed(2) }} s</span>
          <span v-if="span.kind === 'unstable'">"{{ referenceText(span) }}"</span>
          <span :class="['text-neutral-500']">
            {{ span.variants.map(variant => `${variant.text || '(nothing)'} ×${variant.count}`).join(', ') }}
          </span>
        </button>
      </div>
      <details :class="['text-sm']">
        <summary :class="['cursor-pointer font-medium']">
          Thresholds
        </summary>
        <div :class="['grid gap-4 pt-4 md:grid-cols-2']">
          <FieldRange v-model="analysisOptions.toleranceSeconds" label="Same-text tolerance" :min="0.05" :max="0.6" :step="0.05" :format-value="value => `${value.toFixed(2)} s`" />
          <FieldRange v-model="analysisOptions.alignedToleranceSeconds" label="Aligned tolerance" description="An alignment match within this distance counts. It absorbs late emission." :min="0" :max="1.5" :step="0.05" :format-value="value => `${value.toFixed(2)} s`" />
          <FieldRange v-model="analysisOptions.agreementThreshold" label="Unstable below" :min="0.1" :max="1" :step="0.05" />
          <FieldRange v-model="analysisOptions.extraEmissionThreshold" label="Dropped from" :min="0.1" :max="1" :step="0.05" />
          <FieldRange v-model="nucleusOptions.minDipDb" label="Nucleus dip" description="Lower values split an elongated sound into several syllables." :min="1" :max="10" :step="0.5" :format-value="value => `${value} dB`" />
          <FieldRange v-model="untranscribedOptions.minNuclei" label="Untranscribed from" description="Unaccounted syllables in a row." :min="1" :max="5" :step="1" />
          <FieldRange v-model="untranscribedOptions.toleranceSeconds" label="Nucleus tolerance" :min="0.1" :max="0.6" :step="0.05" :format-value="value => `${value.toFixed(2)} s`" />
        </div>
      </details>

      <details :class="['text-sm']" open>
        <summary :class="['cursor-pointer font-medium']">
          Reference tokens
        </summary>
        <div :class="['flex flex-wrap gap-1 pt-2 font-mono text-xs']">
          <span
            v-for="(agreement, index) in annotation.analysis.tokens"
            :key="index"
            :title="`time ${agreement.token.time?.toFixed(2) ?? '-'} s, log p ${agreement.token.logProbability?.toFixed(2) ?? '-'}`"
            :class="['flex flex-col items-center rounded px-1', 'bg-neutral-100 dark:bg-neutral-800']"
          >
            <span>{{ agreement.token.text.replaceAll('▁', '·') }}</span>
            <span :class="['text-neutral-500']">{{ agreementLabel(agreement.byTime) }}</span>
            <span :class="['text-neutral-400']">{{ agreementLabel(agreement.byText) }}</span>
          </span>
        </div>
        <div :class="['pt-1 text-xs text-neutral-500']">
          Second line: agreement by audio time. Third line: agreement by text alignment only.
        </div>
      </details>

      <details :class="['text-sm']">
        <summary :class="['cursor-pointer font-medium']">
          Decodes
        </summary>
        <table :class="['mt-2 w-full text-left text-xs']">
          <thead>
            <tr :class="['text-neutral-500']">
              <th>SNR</th>
              <th>Shift</th>
              <th>Speed</th>
              <th>Text</th>
            </tr>
          </thead>
          <tbody :class="['font-mono']">
            <tr>
              <td colspan="3">
                reference
              </td>
              <td>{{ joinTokens(shown.reference.tokens.map(token => token.text)) }}</td>
            </tr>
            <tr v-for="(sample, index) in shown.samples" :key="index">
              <template v-if="sample.perturbation">
                <td>{{ sample.perturbation.snrDb.toFixed(1) }} dB</td>
                <td>{{ sample.perturbation.shiftMs.toFixed(0) }} ms</td>
                <td>{{ sample.perturbation.speed.toFixed(3) }}</td>
              </template>
              <td v-else colspan="3">
                encoder noise
              </td>
              <td>{{ joinTokens(sample.hypothesis.tokens.map(token => token.text)) }}</td>
            </tr>
            <tr v-if="shown.probe">
              <td colspan="3">
                blank penalty
              </td>
              <td>{{ joinTokens(shown.probe.tokens.map(token => token.text)) }}</td>
            </tr>
          </tbody>
        </table>
      </details>
    </section>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  title: ASR Uncertainty Probe
  subtitleKey: tamagotchi.settings.devtools.title
</route>
