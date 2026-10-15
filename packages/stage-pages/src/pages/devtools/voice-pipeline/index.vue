<script setup lang="ts">
import type { AnalysisOptions, Hotword, LocatedTranscript, NucleusOptions, ProbeNoise, ProbeResult, UncertainSpan, UntranscribedOptions } from '@proj-airi/stage-ui/libs/voice/asr-uncertainty'
import type { VocabularyPack } from '@proj-airi/stage-ui/libs/voice/phonetic-vocabulary'
import type { GuidedScope } from '@proj-airi/stage-ui/libs/voice/span-guided-terms'

import type { ProbeRunSettings } from './composables/use-uncertainty-probe'
import type { UtteranceAudio } from './composables/use-utterance-audio'

import { toWav } from '@proj-airi/audio/encoding'
import { acceptsHotwords, SHERPAW_TRANSCRIPTION_PROVIDER_ID, xAsrBilingualZhEnInt8 } from '@proj-airi/provider-inference'
import { availableSherpawModels } from '@proj-airi/stage-ui/libs/providers/providers/sherpaw/model-resources'
import {
  analyzeHypotheses,
  defaultAnalysisOptions,
  defaultNucleusOptions,
  defaultUntranscribedOptions,
  estimateEmissionDelay,
  findUntranscribedSpeech,
  formatForLlm,
  joinTokens,
  locateTokens,
  measureIntensity,
  shiftTokenTimes,
} from '@proj-airi/stage-ui/libs/voice/asr-uncertainty'
import { kwsVocabulary } from '@proj-airi/stage-ui/libs/voice/kws-model'
import { english, pronounceEnglish } from '@proj-airi/stage-ui/libs/voice/phonetic-english'
import { mandarin, pronounceChinese } from '@proj-airi/stage-ui/libs/voice/phonetic-mandarin'
import { createPhoneticMatcher } from '@proj-airi/stage-ui/libs/voice/phonetic-match'
import { boostHotwords, guideCandidates, matchUncertainSpans, phraseEntries, selectGuidedSuggestions } from '@proj-airi/stage-ui/libs/voice/span-guided-terms'
import { describeBiasDelivery } from '@proj-airi/stage-ui/libs/voice/transcription-bias-delivery'
import { Button, Callout, FieldCheckbox, FieldInputFile, FieldRange, FieldSelect, FieldTextArea, Input, Progress } from '@proj-airi/ui'
import { useObjectUrl } from '@vueuse/core'
import { computed, onScopeDispose, reactive, ref, shallowRef, toRef, useTemplateRef, watch } from 'vue'

import DecodeDetails from './components/decode-details.vue'
import LiveTurns from './components/live-turns.vue'
import SpanList from './components/span-list.vue'
import SuggestionList from './components/suggestion-list.vue'
import UncertaintyTimeline from './components/uncertainty-timeline.vue'

import { microphoneChunks, replayChunks } from './composables/audio-chunks'
import { useElementSpeakingHold } from './composables/speaking-holds'
import { useBiasComparison } from './composables/use-bias-comparison'
import { useClipInput } from './composables/use-clip-input'
import { useConversationTerms } from './composables/use-conversation-terms'
import { useHearingDelivery } from './composables/use-hearing-delivery'
import { useLabRerank } from './composables/use-lab-rerank'
import { useLiveProbe } from './composables/use-live-probe'
import { useLiveVoiceHost } from './composables/use-live-voice-host'
import { useProbeDecoders } from './composables/use-probe-decoders'
import { useUncertaintyProbe } from './composables/use-uncertainty-probe'
import { useVocabularyEditor } from './composables/use-vocabulary-editor'

/** Every Sherpaw model in AIRI runs at 16 kHz. Clips are converted to this rate once, when they load. */
const sampleRate = 16000

/** Clips longer than this make a run slow, because each decode takes about as long as the clip. */
const longClipSeconds = 12

/** Live lag above this is shown. Smaller lag comes from block delivery and decoding one block. */
const lagWarningSeconds = 0.5

/** The first test case of post-ASR matching: ASR often writes the Minecraft mob 硫方怪 as 流氓怪. */
const samplePack: VocabularyPack = {
  source: 'minecraft-wiki',
  entries: [
    { term: 'Sulfur Cube', writtenForms: ['硫方怪'], description: 'A cube-shaped Minecraft mob that lives near sulfur springs.' },
    { term: 'Creeper', writtenForms: ['苦力怕'], description: 'A green Minecraft mob that explodes near the player.' },
    // The CMU dictionary has no "Enderman", so the entry gives its ARPAbet phones.
    { term: 'Enderman', writtenForms: ['Enderman'], pronunciations: [['EH1', 'N', 'D', 'ER0', 'M', 'AE2', 'N']], description: 'A tall Minecraft mob that teleports and picks up blocks.' },
  ],
}

const languages = [mandarin, english]
const pronounce = (text: string) => pronounceChinese(text) ?? pronounceEnglish(text)

// Conversation and vocabulary

const conversation = useConversationTerms()
const sourceOptions = [
  { value: 'session', label: 'Saved chat' },
  { value: 'text', label: 'Pasted conversation' },
]

const vocabularyEditor = useVocabularyEditor(samplePack, { vocabulary: kwsVocabulary, pronounce })
const editingJson = ref(false)
const vocabulary = vocabularyEditor.entries
/** The conversation terms as vocabulary, so they can match uncertain spans and the transcript. */
const phraseVocabulary = computed(() => phraseEntries(conversation.phrases.value, pronounce, { source: 'conversation', description: 'A term from the conversation.' }))

// Audio

const input = useClipInput(sampleRate)
const clipSeconds = computed(() => (input.clip.value?.length ?? 0) / sampleRate)
const clipBlob = computed(() => input.clip.value ? new Blob([toWav(input.clip.value.buffer, sampleRate)], { type: 'audio/wav' }) : undefined)
const clipUrl = useObjectUrl(clipBlob)
/** A running live host can hear the clip through the speakers. It must not take it as a turn. */
const clipPlayback = useElementSpeakingHold()

// Recognition

const models = availableSherpawModels
const modelOptions = models.map(model => ({
  value: model.id,
  label: model.name,
  description: [
    model.recognizer === 'paraformer' ? 'No token times. Only the text alignment works.' : 'Reports token times.',
    acceptsHotwords(model) ? 'Takes hotwords.' : 'Takes no hotwords, so only post-ASR suggestions help it.',
  ].join(' '),
}))
// X-ASR is the desktop default of Hearing for Chinese and English, and it reports token times.
const modelId = ref(models.find(model => model.id === xAsrBilingualZhEnInt8.id)?.id ?? models.find(model => model.recognizer === 'transducer')?.id ?? '')
const selectedModel = computed(() => models.find(candidate => candidate.id === modelId.value))
const modelTakesHotwords = computed(() => selectedModel.value !== undefined && acceptsHotwords(selectedModel.value))

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
  // Hearing sends the conversation terms as hotwords, so the first pass does too.
  sendHotwords: true,
})
const analysisOptions = reactive<AnalysisOptions>({ ...defaultAnalysisOptions })
const nucleusOptions = reactive<NucleusOptions>({ ...defaultNucleusOptions })
const untranscribedOptions = reactive<UntranscribedOptions>({ ...defaultUntranscribedOptions })

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

const firstPassDelivery = computed(() => describeBiasDelivery({ providerId: SHERPAW_TRANSCRIPTION_PROVIDER_ID, supportsHotwords: true, sherpawModel: selectedModel.value }, conversation.phrases.value))
const firstPassHotwords = computed<Hotword[] | undefined>(() => run.sendHotwords && modelTakesHotwords.value ? conversation.phrases.value.map(phrase => ({ phrase })) : undefined)

function runSettings(hotwords: readonly Hotword[] | undefined): ProbeRunSettings | undefined {
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
    hotwords,
  }
}

const decoders = useProbeDecoders()
const probe = useUncertaintyProbe(decoders)
const live = useLiveProbe(decoders)
const boostProbe = useUncertaintyProbe(decoders)

const progressPercent = computed(() => probe.progress.value.total === 0 ? 0 : 100 * probe.progress.value.done / probe.progress.value.total)
const busy = computed(() => probe.status.value === 'loading' || probe.status.value === 'decoding')
const boosting = computed(() => boostProbe.status.value === 'loading' || boostProbe.status.value === 'decoding')
const listening = computed(() => live.status.value === 'loading' || live.status.value === 'listening')
/** A new model or pool size replaces the Workers, which drops their pending decodes. */
const decodersInUse = computed(() => busy.value || boosting.value || listening.value)

/** The utterance whose result the later stages read. Undefined selects the clip result. */
const selectedUtteranceId = ref<number>()

function startProbe() {
  const settings = runSettings(firstPassHotwords.value)
  if (!input.clip.value || !settings)
    return
  selectedUtteranceId.value = undefined
  void probe.run(input.clip.value, settings)
}

// The Live turns section shows the host. The offline microphone paths read it too.
const host = useLiveVoiceHost()

/** The clip that came from a selected live turn, so the clip display can name its turn. */
const turnClip = shallowRef<{ samples: Float32Array<ArrayBuffer>, label: string }>()
function takeTurnClip(utterance: UtteranceAudio, label: string) {
  // The voice pipeline captures at the offline lab rate. Another rate cannot happen, so such a clip is not resampled.
  if (utterance.sampleRate !== sampleRate)
    return
  input.clip.value = utterance.samples
  turnClip.value = { samples: utterance.samples, label }
}

const liveSource = ref<'microphone' | 'clip'>('microphone')
const liveSourceOptions = [
  { value: 'microphone', label: 'Microphone', description: 'Without echo cancellation, noise suppression, or gain control.' },
  { value: 'clip', label: 'Loaded clip', description: 'Plays the clip into the live decoder at real-time speed.' },
]

function startLive() {
  const settings = runSettings(firstPassHotwords.value)
  const replayed = input.clip.value
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

function utteranceStatus(utterance: (typeof live.utterances.value)[number]) {
  if (utterance.status === 'error')
    return utterance.error ?? 'Failed'
  if (utterance.status === 'waiting')
    return 'Waiting for the rollouts'
  return `${utterance.result?.samples.length ?? 0} rollouts, ready ${utterance.latency?.toFixed(1) ?? '-'} s after the endpoint`
}

/**
 * Analysis reruns on every threshold change. The decodes stay as they are.
 * Token times move earlier by the emission delay of the decoder, so spans and nuclei line up with the audio.
 */
function annotate(result: ProbeResult) {
  const contour = measureIntensity(result.clip, sampleRate, { ...nucleusOptions })
  const emissionDelay = estimateEmissionDelay(contour, result.reference)
  const reference = shiftTokenTimes(result.reference, emissionDelay)
  const probeHypothesis = result.probe && shiftTokenTimes(result.probe, emissionDelay)
  const samples = result.samples.map(sample => shiftTokenTimes(sample.hypothesis, emissionDelay))
  const analysis = analyzeHypotheses(reference, samples, result.durationSeconds, { ...analysisOptions })
  const spans: UncertainSpan[] = [
    ...analysis.spans,
    ...findUntranscribedSpeech(contour, reference, { ...untranscribedOptions }, probeHypothesis),
  ].toSorted((a, b) => (a.start ?? a.tokenStart) - (b.start ?? b.tokenStart))
  const transcript = locateTokens(reference.tokens.map(token => token.text))
  return { analysis, contour, emissionDelay, probe: probeHypothesis, spans, transcript, llmText: formatForLlm(reference, spans) }
}

const liveTexts = computed(() => new Map(live.utterances.value.flatMap(utterance => utterance.result ? [[utterance.id, annotate(utterance.result).llmText] as const] : [])))

const shown = computed(() => {
  const utterance = live.utterances.value.find(candidate => candidate.id === selectedUtteranceId.value)
  return selectedUtteranceId.value === undefined ? probe.result.value : utterance?.result
})
const annotation = computed(() => shown.value ? annotate(shown.value) : undefined)

/** Probes a live turn in the lab, with the lab settings. The result shows in the lab sections, never in the chat. */
function runTurnRollouts(utterance: UtteranceAudio, label: string) {
  takeTurnClip(utterance, label)
  if (input.clip.value === utterance.samples)
    startProbe()
}
const rolloutsBusy = computed(() => {
  if (decodersInUse.value)
    return 'The offline lab decoders are busy.'
  if (!modelId.value)
    return 'The offline lab has no Sherpaw model.'
  return undefined
})
const rolloutsStatus = computed(() => {
  if (probe.status.value === 'loading')
    return 'Loading the model...'
  if (probe.status.value === 'decoding')
    return `Decode ${probe.progress.value.done} of ${probe.progress.value.total}`
  if (probe.error.value)
    return probe.error.value
  const turn = turnClip.value
  if (probe.status.value === 'done' && annotation.value && selectedUtteranceId.value === undefined && turn && turn.samples === probe.result.value?.clip)
    return `${annotation.value.spans.length} uncertain spans in ${turn.label}. See section 4.`
  return undefined
})
const shownBlob = computed(() => shown.value ? new Blob([toWav(new Float32Array(shown.value.clip).buffer, sampleRate)], { type: 'audio/wav' }) : undefined)
const shownUrl = useObjectUrl(shownBlob)
const shownPlayback = useElementSpeakingHold()
const player = useTemplateRef<HTMLAudioElement>('player')

/** A span covers the token times. This much audio on each side covers the whole syllables. */
const SPAN_PLAYBACK_MARGIN_SECONDS = 0.1
let playRequest = 0

/** Plays from `start`. With `end`, playback stops there, so a span plays alone. */
function play(start: number, end?: number) {
  const element = player.value
  if (!element)
    return
  const request = ++playRequest
  element.currentTime = Math.max(0, start - (end === undefined ? 0 : SPAN_PLAYBACK_MARGIN_SECONDS))
  const started = element.play()
  if (end === undefined) {
    void started.catch(() => {})
    return
  }

  // The check reads the audio position, not the wall clock, so a slow start or a slow audio clock stops on time.
  // It ends when playback pauses or ends, when a later request plays, or when the page closes.
  const stopAt = end + SPAN_PLAYBACK_MARGIN_SECONDS
  const check = () => {
    if (request !== playRequest || element.paused || element.ended)
      return
    if (element.currentTime >= stopAt)
      element.pause()
    else
      requestAnimationFrame(check)
  }
  void started.then(check, () => {})
}

// Closing the page ends a running span check.
onScopeDispose(() => playRequest++)

// Hotword boost

const boost = reactive({
  baseScore: 1.5,
  boostScore: 4,
  scope: 'all' as 'all' | 'matched',
  threshold: 0.7,
  /** Off by default: guessed domain terms reach ASR only when a span sounds like them and this is on. */
  vocabulary: false,
})
const boostScopeOptions = [
  { value: 'all', label: 'All phrases', description: 'Sends every conversation term. Terms that sound like an uncertain span get the boost score.' },
  { value: 'matched', label: 'Matched phrases only', description: 'Sends only the terms that sound like an uncertain span, so the other terms cannot cause insertions.' },
]
const spanMatchOptions = computed(() => ({ threshold: boost.threshold, guessedThreshold: Math.min(boost.threshold, 0.65) }))
const boosts = computed(() => {
  const current = annotation.value
  if (!current)
    return []
  const phraseCandidates = matchUncertainSpans(current.transcript, current.spans, phraseVocabulary.value, languages, spanMatchOptions.value)
  const vocabularyCandidates = boost.vocabulary ? matchUncertainSpans(current.transcript, current.spans, vocabulary.value, languages, spanMatchOptions.value) : []
  return boostHotwords(conversation.phrases.value, phraseCandidates, { baseScore: boost.baseScore, boostScore: boost.boostScore, scope: boost.scope }, vocabularyCandidates)
})
const boostedCount = computed(() => boosts.value.filter(item => item.match).length)

/**
 * The settings of a boosted decode, as one comparable key: the model, the run settings, and the scored hotwords.
 * A boosted result counts only while the current settings give the same key, so an edit never leaves an old decode on show.
 */
function boostKey(settings: ProbeRunSettings | undefined) {
  if (!settings)
    return undefined
  const { model, ...rest } = settings
  return JSON.stringify({ model: model.id, ...rest })
}
const boostSettings = computed(() => runSettings(boosts.value.map(({ phrase, score }) => ({ phrase, score }))))

/** The result and the settings key that the boosted decode started from. Its result belongs to them only. */
const boostedFrom = shallowRef<{ source: ProbeResult, key: string }>()
function startBoost() {
  const source = shown.value
  const settings = boostSettings.value
  const key = boostKey(settings)
  if (!source || !settings || !key)
    return
  boostedFrom.value = { source, key }
  void boostProbe.run(source.clip, settings)
}
const boosted = computed(() => {
  const from = boostedFrom.value
  if (!from || from.source !== shown.value || from.key !== boostKey(boostSettings.value) || boostProbe.status.value !== 'done')
    return undefined
  return boostProbe.result.value
})
const boostedAnnotation = computed(() => boosted.value ? annotate(boosted.value) : undefined)

// Post-ASR suggestions

const post = reactive({
  source: 'recognized' as 'recognized' | 'typed',
  typed: '我刚才在温泉边遇到了一只流氓怪，后面还有个酷力爬. Then an end her man took a block.',
  threshold: 0.78,
  guessedThreshold: 0.7,
  spanThreshold: 0.7,
  scope: 'first' as GuidedScope,
  conversationTerms: true,
  rerank: false,
})
const postSourceOptions = [
  { value: 'recognized', label: 'Recognized', description: 'The boosted decode when it ran for the selected result, otherwise the first decode.' },
  { value: 'typed', label: 'Typed text', description: 'Text without audio, so it has no uncertain spans.' },
]
const scopeOptions = [
  { value: 'first', label: 'Uncertain spans first', description: 'Matches inside uncertain spans use the span threshold and come first. Other matches follow.' },
  { value: 'only', label: 'Uncertain spans only', description: 'Only matches inside uncertain spans remain.' },
  { value: 'off', label: 'Ignore uncertainty', description: 'The plain phonetic match of the whole transcript, as the voice plugin does today.' },
]

/** The final recognized text: the boosted decode when it exists, so the suggestions cover what boosting left unclear. */
const recognized = computed(() => boostedAnnotation.value && boosted.value
  ? { result: boosted.value, annotation: boostedAnnotation.value, boosted: true }
  : shown.value && annotation.value ? { result: shown.value, annotation: annotation.value, boosted: false } : undefined)

const emptySpans: readonly UncertainSpan[] = Object.freeze([])
const postInput = computed((): { transcript: LocatedTranscript, spans: readonly UncertainSpan[] } => {
  if (post.source === 'recognized' && recognized.value)
    return { transcript: recognized.value.annotation.transcript, spans: recognized.value.annotation.spans }
  return { transcript: { text: post.typed, ranges: [] }, spans: emptySpans }
})
const postVocabulary = computed(() => {
  if (!post.conversationTerms)
    return vocabulary.value
  const listed = new Set(vocabulary.value.flatMap(entry => entry.writtenForms.map(form => form.toLowerCase())))
  return [...vocabulary.value, ...phraseVocabulary.value.filter(entry => !listed.has(entry.term.toLowerCase()))]
})
const guided = computed(() => {
  const { transcript, spans } = postInput.value
  const whole = createPhoneticMatcher(postVocabulary.value, languages, { threshold: post.threshold, guessedThreshold: post.guessedThreshold })(transcript.text)
  const inSpans = post.scope === 'off' ? [] : matchUncertainSpans(transcript, spans, postVocabulary.value, languages, { threshold: post.spanThreshold, guessedThreshold: Math.min(post.spanThreshold, post.guessedThreshold) })
  return guideCandidates(whole, inSpans, transcript, spans, post.scope)
})
/** As the live reranker reads the chat: the last six user and assistant messages. */
const rerankHistory = computed(() => conversation.messages.value.filter(message => message.role === 'user' || message.role === 'assistant').slice(-6).map(message => message.text))
const labRerank = useLabRerank({
  enabled: toRef(post, 'rerank'),
  text: computed(() => postInput.value.transcript.text),
  candidates: guided,
  scope: toRef(post, 'scope'),
  history: rerankHistory,
})
const phoneticSuggestions = computed(() => selectGuidedSuggestions(guided.value))
const suggestions = computed(() => post.rerank && labRerank.ranked.value ? selectGuidedSuggestions(labRerank.ranked.value) : phoneticSuggestions.value)
/** The phonetic order, shown when the rerank changed the suggestions. */
const reorderedFrom = computed(() => post.rerank && labRerank.ranked.value && suggestions.value.some((item, index) => phoneticSuggestions.value[index] !== item)
  ? phoneticSuggestions.value.map(item => item.candidate).join(', ')
  : undefined)
// A near-zero threshold keeps every reading, so a near miss shows how far it is from the threshold.
const nearest = computed(() => createPhoneticMatcher(postVocabulary.value, languages, { threshold: 0.01, guessedThreshold: 0.01, limit: 10 })(postInput.value.transcript.text))
const tokens = computed(() => languages.flatMap(language => language.units(postInput.value.transcript.text)).map(units => units.map(unit => unit.tokens.join(' ')).join(' · ')))

// What the LLM reads

const llmTranscript = computed(() => post.source === 'recognized' && recognized.value ? recognized.value.annotation.llmText : post.typed)
const llmSuggestions = computed(() => JSON.stringify(suggestions.value.map(({ span, candidate, term, score, source, description }) => ({ span, candidate, term, score, source, description })), null, 2))

// The later stages follow a new recognition result.
watch(shown, (result) => {
  if (result)
    post.source = 'recognized'
})

// Compare with the active Hearing provider

const { providerId, sherpawModel: hearingSherpawModel, delivery: hearingDelivery } = useHearingDelivery(() => conversation.phrases.value)

const comparison = useBiasComparison()
function compare() {
  if (clipBlob.value)
    void comparison.compare(clipBlob.value, conversation.phrases.value)
}
</script>

<template>
  <div :class="['flex flex-col gap-8 pb-12']">
    <LiveTurns
      :host="host"
      :microphone-busy="input.recording.value !== undefined || (listening && liveSource === 'microphone')"
      :rollouts-busy="rolloutsBusy"
      :rollouts-status="rolloutsStatus"
      @select-utterance="takeTurnClip"
      @run-rollouts="runTurnRollouts"
    />

    <div :class="['flex flex-col gap-2 border-t border-neutral-200 pt-6 dark:border-neutral-700']">
      <h2 :class="['text-xl font-semibold']">
        Offline lab
      </h2>
      <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
        Tests the input steps on one clip, outside the live pipeline. Nothing here goes to a chat.
      </p>
    </div>

    <Callout label="The voice input pipeline">
      <p>
        Conversation terms become hotwords. The probe decodes the speech many times with noise and finds the spans that recognition is unsure of.
        Terms that sound like an uncertain span get a higher hotword score, and a second decode shows the effect. A model without hotword support skips that step.
        Then post-ASR matching suggests vocabulary terms for the transcript, uncertain spans first. The transcript never changes. The chat model reads the suggestions.
      </p>
    </Callout>

    <section :class="['flex flex-col gap-4']">
      <h3 :class="['text-lg font-semibold']">
        1. Conversation terms
      </h3>
      <FieldSelect v-model="conversation.source.value" label="Source" :options="sourceOptions" />
      <template v-if="conversation.source.value === 'session'">
        <FieldSelect v-model="conversation.selectedSessionId.value" label="Chat" :options="conversation.sessionOptions.value" placeholder="Select a chat" />
        <div :class="['flex flex-wrap items-center gap-4']">
          <Button icon="i-solar:refresh-bold" label="Reload the chat" @click="conversation.loadSelectedSession" />
          <span :class="['text-sm text-neutral-500']">{{ conversation.sessionMessages.value.length }} messages</span>
          <span v-if="conversation.sessionError.value" :class="['text-sm text-red-500']">{{ conversation.sessionError.value }}</span>
        </div>
      </template>
      <FieldTextArea
        v-else
        v-model="conversation.pasted.value"
        label="Messages"
        description="One message per line, starting with user: or assistant:. Only user and assistant messages count."
        :required="false"
        :rows="5"
      />
      <FieldTextArea
        v-model="conversation.extra.value"
        label="Extra phrases"
        description="One phrase per line. They join the list after the conversation terms, as a later source such as memory will."
        :required="false"
        :rows="2"
      />
      <p v-if="conversation.rows.value.length === 0" :class="['text-sm text-neutral-500']">
        No term qualifies. Quoted spans, identifiers such as useMemo or ASR, and capitalized names inside a sentence qualify.
      </p>
      <table v-else :class="['w-full text-left text-sm']">
        <thead>
          <tr :class="['text-xs text-neutral-500']">
            <th :class="['py-1']">
              Phrase
            </th>
            <th>Form</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in conversation.rows.value" :key="row.phrase" :class="['border-t border-neutral-200 dark:border-neutral-800']">
            <td :class="['py-1 font-mono']">
              {{ row.phrase }}
            </td>
            <td :class="['text-neutral-500']">
              {{ row.form }}
            </td>
            <td :class="['font-mono text-neutral-500']">
              {{ row.score?.toFixed(2) ?? '-' }}
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section :class="['flex flex-col gap-2']">
      <h3 :class="['text-lg font-semibold']">
        2. Domain vocabulary
      </h3>
      <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
        Domain terms go only to post-ASR matching, never to recognition as hotwords, unless step 5 allows it.
        Separate written forms with commas. Leave the pronunciation empty to derive it from a Chinese or English written form,
        or write tokens separated by spaces, with <code>;</code> between alternatives.
      </p>
      <div :class="['flex flex-wrap items-center gap-2']">
        <Input v-model="vocabularyEditor.stored.value.source" size="sm" placeholder="Source (manual)" :class="['max-w-48']" />
        <Button v-if="!editingJson" label="Add term" icon="i-solar:add-circle-bold-duotone" variant="primary" size="sm" @click="vocabularyEditor.add()" />
        <Button v-if="!editingJson" label="Edit as JSON" size="sm" @click="vocabularyEditor.openJson(); editingJson = true" />
        <Button v-else label="Apply JSON" variant="primary" size="sm" @click="editingJson = !vocabularyEditor.applyJson()" />
        <Button v-if="editingJson" label="Cancel" size="sm" @click="editingJson = false" />
        <Button label="Reset to sample" size="sm" @click="vocabularyEditor.reset(); editingJson = false" />
      </div>
      <template v-if="editingJson">
        <FieldTextArea
          v-model="vocabularyEditor.json.value"
          label="Vocabulary pack"
          description="JSON with a source and entries. Apply replaces the table."
          :required="false"
          :rows="12"
          textarea-class="font-mono"
        />
        <div v-if="vocabularyEditor.jsonError.value" :class="['text-sm text-red-600 dark:text-red-400']">
          {{ vocabularyEditor.jsonError.value }}
        </div>
      </template>
      <table v-else :class="['w-full text-sm']">
        <thead>
          <tr :class="['text-left text-xs text-neutral-500']">
            <th :class="['font-normal']">
              Term
            </th>
            <th :class="['font-normal']">
              Written forms
            </th>
            <th :class="['font-normal']">
              Pronunciation
            </th>
            <th :class="['font-normal']">
              Description
            </th>
            <th />
          </tr>
        </thead>
        <tbody>
          <template v-for="(row, index) in vocabularyEditor.stored.value.rows" :key="index">
            <tr>
              <td :class="['pr-2 pt-2']">
                <Input v-model="row.term" size="sm" placeholder="Sulfur Cube" />
              </td>
              <td :class="['pr-2 pt-2']">
                <Input v-model="row.writtenForms" size="sm" placeholder="硫方怪, sulfur cube" />
              </td>
              <td :class="['pr-2 pt-2']">
                <Input v-model="row.pronunciations" size="sm" placeholder="auto" :class="['font-mono']" />
              </td>
              <td :class="['pr-2 pt-2']">
                <Input v-model="row.description" size="sm" placeholder="What the chat model reads when the term matches" />
              </td>
              <td :class="['pt-2']">
                <Button icon="i-solar:trash-bin-minimalistic-bold-duotone" shape="circle" size="sm" :aria-label="`Remove ${row.term || 'row'}`" @click="vocabularyEditor.remove(index)" />
              </td>
            </tr>
            <tr>
              <td colspan="5" :class="['pb-1 text-xs']">
                <span v-if="'error' in vocabularyEditor.statuses.value[index]" :class="['text-red-600 dark:text-red-400']">
                  {{ vocabularyEditor.statuses.value[index].error }}
                </span>
                <span v-else-if="vocabularyEditor.statuses.value[index].derived" :class="['font-mono text-neutral-500']">
                  auto: {{ vocabularyEditor.statuses.value[index].entry.pronunciations.map(tokens => tokens.join(' ')).join('; ') }}
                </span>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
      <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
        {{ vocabulary.length }} of {{ vocabularyEditor.stored.value.rows.length }} terms usable. Edits stay in this browser.
      </div>
    </section>

    <section :class="['flex flex-col gap-4']">
      <h3 :class="['text-lg font-semibold']">
        3. Recognition
      </h3>
      <div :class="['grid gap-4 md:grid-cols-2']">
        <FieldInputFile v-model="input.files.value" label="Audio file" description="Any format the browser can decode. It is converted to 16 kHz mono." accept="audio/*" />
        <div :class="['flex flex-col gap-2']">
          <div :class="['text-sm font-medium']">
            Microphone
          </div>
          <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
            Records without echo cancellation, noise suppression, or gain control, so the probe sees the raw input.
            <template v-if="host.recordingBlocked.value">
              {{ host.recordingBlocked.value }}
            </template>
          </div>
          <div>
            <Button v-if="!input.recording.value" icon="i-solar:microphone-3-bold-duotone" label="Record" :disabled="listening || !!host.recordingBlocked.value" @click="input.record" />
            <Button v-else icon="i-solar:stop-bold" color="red" label="Stop" @click="input.stop" />
          </div>
        </div>
      </div>
      <p v-if="input.error.value" :class="['text-sm text-red-500']">
        {{ input.error.value }}
      </p>
      <div v-if="input.clip.value" :class="['flex flex-wrap items-center gap-4 text-sm']">
        <audio :src="clipUrl" controls @play="clipPlayback.start" @pause="clipPlayback.end" @ended="clipPlayback.end" @emptied="clipPlayback.end" />
        <span>{{ clipSeconds.toFixed(1) }} s</span>
        <span v-if="turnClip && turnClip.samples === input.clip.value" :class="['text-neutral-500 dark:text-neutral-400']">From {{ turnClip.label }}</span>
        <span v-if="clipSeconds > longClipSeconds" :class="['text-amber-600 dark:text-amber-400']">
          Long clip. Each decode takes about as long as the clip, so trim it for faster runs.
        </span>
      </div>

      <fieldset :disabled="decodersInUse" :class="['flex flex-col gap-4']">
        <FieldSelect v-model="modelId" label="Model" description="Downloads the model when it is not installed yet." :options="modelOptions" :disabled="decodersInUse" />
        <FieldRange
          v-model="run.workers"
          label="Decoder Workers"
          description="Decodes that run at the same time. Each Worker holds its own copy of the model, so each one adds about the model size in memory. The Workers keep the model loaded between runs."
          :min="1" :max="8" :step="1"
        />
      </fieldset>
      <FieldCheckbox
        v-model="run.sendHotwords"
        label="Send the conversation terms as hotwords"
        description="As Hearing does. Hotwords switch the decode to modified beam search, which is slower than greedy search."
        :disabled="!modelTakesHotwords"
      />
      <p :class="['text-xs text-neutral-500 dark:text-neutral-400']">
        {{ firstPassDelivery.note }}
      </p>
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
        <Button variant="primary" color="primary" icon="i-solar:play-bold" label="Probe the clip" :disabled="!input.clip.value || decodersInUse || !modelId" @click="startProbe" />
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

      <details :class="['flex flex-col gap-4 text-sm']">
        <summary :class="['cursor-pointer font-medium']">
          Live input
        </summary>
        <div :class="['flex flex-col gap-4 pt-2']">
          <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
            The Workers decode the input as it arrives: one clean stream, the rollouts, and the blank penalty stream. Each endpoint of the clean stream cuts every stream at the same input.
            Live mode adds noise only. Select an utterance to send it through the later steps.
          </div>
          <FieldSelect v-model="liveSource" label="Input" :options="liveSourceOptions" :disabled="listening" />
          <p v-if="liveSource === 'microphone' && host.recordingBlocked.value" :class="['text-xs text-amber-600 dark:text-amber-400']">
            {{ host.recordingBlocked.value }}
          </p>
          <div :class="['flex flex-wrap items-center gap-4']">
            <Button
              v-if="!listening"
              variant="primary" color="primary" icon="i-solar:soundwave-bold-duotone" label="Start"
              :disabled="!modelId || busy || boosting || input.recording.value !== undefined || (liveSource === 'clip' && !input.clip.value) || (liveSource === 'microphone' && !!host.recordingBlocked.value)"
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
        </div>
      </details>

      <details :class="['text-sm']">
        <summary :class="['cursor-pointer font-medium']">
          Compare with the active Hearing provider
        </summary>
        <div :class="['flex flex-col gap-3 pt-2']">
          <div :class="['flex flex-wrap items-center gap-3']">
            <span :class="['font-mono']">{{ providerId || '(no provider)' }}</span>
            <span v-if="hearingSherpawModel" :class="['text-neutral-500']">{{ hearingSherpawModel.name }}</span>
            <span :class="['rounded px-2 py-0.5 text-xs font-medium', 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300']">{{ hearingDelivery.status }}</span>
          </div>
          <p :class="['text-xs text-neutral-500 dark:text-neutral-400']">
            {{ hearingDelivery.note }} Transcribes the clip twice with the Hearing provider, without and with the conversation terms. It reports text only, so it gets no uncertain spans.
          </p>
          <div>
            <Button icon="i-solar:play-bold" label="Compare" :disabled="!clipBlob || comparison.running.value" @click="compare" />
          </div>
          <div
            v-for="item in comparison.runs.value"
            :key="item.label"
            :class="['flex flex-col gap-1 rounded-lg p-3', 'bg-neutral-100 dark:bg-neutral-800']"
          >
            <div :class="['flex gap-3 text-xs text-neutral-500']">
              <span :class="['font-medium']">{{ item.label }}</span>
              <span v-if="item.milliseconds !== undefined" :class="['font-mono']">{{ (item.milliseconds / 1000).toFixed(1) }} s</span>
              <span v-else-if="!item.error">Transcribing...</span>
            </div>
            <span v-if="item.error" :class="['text-red-500']">{{ item.error }}</span>
            <span v-else-if="item.text !== undefined">{{ item.text || '(no words)' }}</span>
          </div>
        </div>
      </details>
    </section>

    <section :class="['flex flex-col gap-4']">
      <h3 :class="['text-lg font-semibold']">
        4. Uncertainty
      </h3>
      <p v-if="!shown || !annotation" :class="['text-sm text-neutral-500']">
        Probe a clip or select a live utterance.
      </p>
      <template v-else>
        <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
          Click a span to play only that span, or elsewhere on the chart to play from that point. Span colors: amber is unstable, red is dropped, violet is untranscribed.
          <template v-if="annotation.emissionDelay > 0">
            The decoder emitted tokens about {{ annotation.emissionDelay.toFixed(2) }} s after their syllables, so token times are moved that much earlier.
          </template>
        </div>
        <audio ref="player" :src="shownUrl" controls @play="shownPlayback.start" @pause="shownPlayback.end" @ended="shownPlayback.end" @emptied="shownPlayback.end" />
        <UncertaintyTimeline
          :duration-seconds="shown.durationSeconds"
          :contour="annotation.contour"
          :tokens="annotation.analysis.tokens"
          :timeline="annotation.analysis.timeline"
          :spans="annotation.spans"
          :probe-tokens="annotation.probe?.tokens"
          :agreement-threshold="analysisOptions.agreementThreshold"
          @play="play"
        />
        <SpanList :spans="annotation.spans" :reference="shown.reference" @play="play" />
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
        <DecodeDetails :result="shown" :tokens="annotation.analysis.tokens" />
      </template>
    </section>

    <section :class="['flex flex-col gap-4']">
      <h3 :class="['text-lg font-semibold']">
        5. Hotword boost
      </h3>
      <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
        Each conversation term is matched by sound against what the decodes heard in each uncertain span, the transcript text and the variants.
        A matched term gets the boost score, and the clip is decoded again with the new list.
      </div>
      <p v-if="selectedModel && !modelTakesHotwords" :class="['text-sm text-amber-600 dark:text-amber-400']">
        {{ selectedModel.name }} cannot take hotwords, so this step cannot run. Step 6 covers it with post-ASR suggestions.
      </p>
      <div :class="['grid gap-4 md:grid-cols-2']">
        <FieldSelect v-model="boost.scope" label="Hotword list" :options="boostScopeOptions" />
        <FieldRange v-model="boost.threshold" label="Span match threshold" description="The lowest sound similarity between a term and a span." :min="0.5" :max="1" :step="0.01" :format-value="value => value.toFixed(2)" />
        <FieldRange v-model="boost.baseScore" label="Base score" description="Score of a term that no span sounds like. sherpa-onnx uses 1.5 by default." :min="0" :max="10" :step="0.5" />
        <FieldRange v-model="boost.boostScore" label="Boost score" description="Score of a term that sounds like an uncertain span." :min="0" :max="10" :step="0.5" />
      </div>
      <FieldCheckbox
        v-model="boost.vocabulary"
        label="Also boost domain terms near uncertain spans"
        description="Experiment. A domain term joins the hotwords only where an uncertain span sounds like it. Guessed terms in hotwords can cause false insertions, so Hearing does not do this."
      />
      <p v-if="!annotation" :class="['text-sm text-neutral-500']">
        Needs a recognition result.
      </p>
      <table v-else-if="boosts.length" :class="['w-full text-left text-sm']">
        <thead>
          <tr :class="['text-xs text-neutral-500']">
            <th :class="['py-1']">
              Hotword
            </th>
            <th>Score</th>
            <th>Matched span</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in boosts" :key="item.phrase" :class="['border-t border-neutral-200 dark:border-neutral-800']">
            <td :class="['py-1 font-mono']">
              {{ item.phrase }}
              <span v-if="item.fromVocabulary" :class="['text-xs text-neutral-500']">(domain)</span>
            </td>
            <td :class="['font-mono', item.match ? 'text-primary-600 dark:text-primary-400' : 'text-neutral-500']">
              {{ item.score.toFixed(1) }}
            </td>
            <td :class="['text-neutral-500']">
              <template v-if="item.match">
                {{ item.match.kind }} "{{ item.match.heard }}"{{ item.match.heardCount === undefined ? '' : ` ×${item.match.heardCount}` }} · {{ item.match.score.toFixed(2) }}
              </template>
              <template v-else>
                -
              </template>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else :class="['text-sm text-neutral-500']">
        No hotword to send.
      </p>
      <div v-if="annotation" :class="['flex flex-wrap items-center gap-4']">
        <Button
          variant="primary" color="primary" icon="i-solar:refresh-bold" label="Decode again with these hotwords"
          :disabled="!modelTakesHotwords || boostedCount === 0 || decodersInUse"
          @click="startBoost"
        />
        <Button v-if="boosting" label="Stop" @click="boostProbe.cancel()" />
        <span :class="['text-sm text-neutral-500']">{{ boostedCount }} of {{ boosts.length }} hotwords boosted</span>
        <span v-if="boosting" :class="['text-sm']">Decoding...</span>
      </div>
      <p v-if="boostProbe.error.value" :class="['text-sm text-red-500']">
        {{ boostProbe.error.value }}
      </p>
      <div v-if="boosted && boostedAnnotation && annotation && shown" :class="['grid gap-2 text-sm md:grid-cols-2']">
        <div :class="['flex flex-col gap-1 rounded-lg p-3', 'bg-neutral-100 dark:bg-neutral-800']">
          <span :class="['text-xs text-neutral-500']">First decode · {{ annotation.spans.length }} uncertain spans</span>
          <span>{{ joinTokens(shown.reference.tokens.map(token => token.text)) || '(no words)' }}</span>
        </div>
        <div :class="['flex flex-col gap-1 rounded-lg p-3', 'bg-neutral-100 dark:bg-neutral-800']">
          <span :class="['text-xs text-neutral-500']">Boosted decode · {{ boostedAnnotation.spans.length }} uncertain spans</span>
          <span>{{ joinTokens(boosted.reference.tokens.map(token => token.text)) || '(no words)' }}</span>
        </div>
      </div>
      <details v-if="boosted && boostedAnnotation" :class="['text-sm']">
        <summary :class="['cursor-pointer font-medium']">
          Uncertain spans of the boosted decode
        </summary>
        <div :class="['pt-2']">
          <SpanList :spans="boostedAnnotation.spans" :reference="boosted.reference" @play="play" />
        </div>
      </details>
    </section>

    <section :class="['flex flex-col gap-4']">
      <h3 :class="['text-lg font-semibold']">
        6. Post-ASR suggestions
      </h3>
      <div :class="['grid gap-4 md:grid-cols-2']">
        <FieldSelect v-model="post.source" label="Transcript" :options="postSourceOptions" />
        <FieldSelect v-model="post.scope" label="Uncertainty" :options="scopeOptions" />
      </div>
      <FieldTextArea
        v-if="post.source === 'typed' || !recognized"
        v-model="post.typed"
        label="Typed transcript"
        description="Text as the speech recognizer wrote it. Chinese and English text match. A phrase that mixes the two does not."
        :required="false"
        :rows="2"
      />
      <p v-else :class="['rounded-lg p-3 text-sm', 'bg-neutral-100 dark:bg-neutral-800']">
        <span :class="['text-xs text-neutral-500']">{{ recognized.boosted ? 'Boosted decode' : 'First decode' }} · </span>
        {{ recognized.annotation.transcript.text || '(no words)' }}
      </p>
      <FieldCheckbox v-model="post.conversationTerms" label="Match the conversation terms too" description="Helps most for a model without hotword support, because the terms never reached recognition." />
      <div :class="['grid gap-4 md:grid-cols-3']">
        <FieldRange v-model="post.threshold" label="Threshold" description="The lowest similarity outside the uncertain spans." :min="0.5" :max="1" :step="0.01" :format-value="value => value.toFixed(2)" />
        <FieldRange v-model="post.guessedThreshold" label="Threshold for unknown words" description="For a phrase with a word that is not in the dictionary." :min="0.5" :max="1" :step="0.01" :format-value="value => value.toFixed(2)" />
        <FieldRange v-model="post.spanThreshold" label="Span threshold" description="The lowest similarity inside an uncertain span." :min="0.5" :max="1" :step="0.01" :format-value="value => value.toFixed(2)" />
      </div>
      <FieldCheckbox
        v-model="post.rerank"
        label="Rerank by the conversation"
        description="As live turns do with the Hearing switch: multilingual E5 orders near ties on sound by meaning, from the transcript and the last six messages of step 1. It downloads about 120 MB once."
      />
      <p v-if="post.rerank && labRerank.running.value" :class="['text-sm text-neutral-500']">
        Reranking. The first run loads the model.
      </p>
      <p v-if="reorderedFrom" :class="['text-xs text-neutral-500 dark:text-neutral-400']">
        The rerank changed the order. By sound alone: {{ reorderedFrom }}.
      </p>
      <SuggestionList :suggestions="suggestions" />
      <details :class="['text-sm']">
        <summary :class="['cursor-pointer font-medium']">
          Nearest candidates
        </summary>
        <div :class="['flex flex-col gap-1 pt-2']">
          <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
            The ten closest whole-transcript candidates at any score above zero.
          </div>
          <div
            v-for="item in nearest"
            :key="`${item.start}:${item.end}:${item.candidate}`"
            :class="['flex flex-wrap items-baseline gap-2', item.score >= post.threshold ? '' : 'text-neutral-400 dark:text-neutral-500']"
          >
            <span>{{ item.span }}</span>
            <span :class="['i-solar:arrow-right-linear']" />
            <span>{{ item.candidate }}</span>
            <span :class="['font-mono text-xs']">{{ item.score.toFixed(2) }}</span>
          </div>
        </div>
      </details>
      <details :class="['text-sm']">
        <summary :class="['cursor-pointer font-medium']">
          Transcript tokens
        </summary>
        <div :class="['flex flex-col gap-1 pt-2']">
          <code
            v-for="(unitRun, index) in tokens"
            :key="index"
            :class="['rounded-lg bg-neutral-100 px-3 py-2 text-xs dark:bg-neutral-900']"
          >{{ unitRun }}</code>
        </div>
      </details>
    </section>

    <section :class="['flex flex-col gap-2']">
      <h3 :class="['text-lg font-semibold']">
        7. What the chat model reads
      </h3>
      <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
        The transcript with the uncertain spans marked, and the suggestions as submission context.
      </div>
      <pre :class="['whitespace-pre-wrap rounded-lg p-3 text-sm', 'bg-neutral-100 dark:bg-neutral-800']">{{ llmTranscript }}</pre>
      <pre :class="['whitespace-pre-wrap rounded-lg p-3 text-xs', 'bg-neutral-100 dark:bg-neutral-800']">{{ llmSuggestions }}</pre>
    </section>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: tamagotchi.settings.devtools.pages.voice-pipeline.title
  subtitleKey: tamagotchi.settings.devtools.title
</route>
