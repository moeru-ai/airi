import type { TraceRecord } from '../core/types'
import type { MetricSample, MetricSamples } from '../projections/metrics'
import type { TraceProjection } from '../projections/reader'

import { ATTR_DECISION_LATENCY_MS, TraceEdgeKinds } from '../conventions'
import {
  defineAttribute,
  defineEndReason,
  defineIdKey,
  defineMetric,
  definePipeline,
  definePreset,
  defineProfile,
  defineTrack,
  matchTrackPath,
} from '../core/define'
import { spanKeyOf } from '../core/types'

/** Track path patterns of the voice profile. Fill them with `trackPath`. */
export const VoiceTracks = {
  State: 'participants/{actor}/state',
  Wake: 'participants/{actor}/wake',
  Input: 'participants/{actor}/input',
  Speech: 'participants/{actor}/speech',
  ASR: 'participants/{actor}/asr',
  Rephrase: 'participants/{actor}/rephrase',
  Text: 'participants/{actor}/text',
  Output: 'participants/{actor}/output',
  TTS: 'participants/{actor}/tts',
  Playback: 'participants/{actor}/playback',
  Floor: 'conversations/{conversation}/floor',
  Endpoint: 'conversations/{conversation}/endpoint',
  Speculation: 'conversations/{conversation}/speculation',
} as const

/** Value keys of the voice series. */
export const VoiceSeries = {
  /** Audio level from -60 dBFS (0) to full scale (1), on the input and playback tracks. */
  Level: 'level',
  /** Speech probability of the VAD, from 0 to 1, on the input track. One sample for each detector window, like the level. */
  Probability: 'probability',
} as const

export const VoiceIdKeys = {
  Conversation: 'conversation',
  Turn: 'turn',
  TurnSeq: 'turnSeq',
  Input: 'input',
  Response: 'response',
  Segment: 'segment',
  Speculation: 'speculation',
  Interrupt: 'interrupt',
  Actor: 'actor',
} as const

/** Span and instant names. Instants use `<object>.<past-tense verb>`. */
export const VoiceNames = {
  WakeWord: 'wake-word',
  VoiceInput: 'voice-input',
  SpeechSegment: 'speech',
  SpeechRecognition: 'asr',
  EndpointJudgement: 'endpoint.judgement',
  TranscriptRephrase: 'transcript.rephrase',
  SpeechOutput: 'speech-output',
  TTSRequest: 'tts',
  Playback: 'playback',
  SpeechStarted: 'speech.started',
  SpeechStopped: 'speech.stopped',
  TranscriptPartial: 'transcript.partial',
  TranscriptFinal: 'transcript.final',
  EndpointDecided: 'endpoint.decided',
  TurnEnded: 'turn.ended',
  TurnHeld: 'turn.held',
  FloorTaken: 'floor.taken',
  FloorReleased: 'floor.released',
  InterruptStarted: 'interrupt.started',
  BackchannelDetected: 'backchannel.detected',
  OutputTruncated: 'output.truncated',
  TTSFirstByte: 'tts.first_byte',
  TTSFirstAudible: 'tts.first_audible',
} as const

/** Attributes of the voice profile. */
export const VoiceAttributes = {
  /** `control` (a voice button or Push to Talk), `speech` (VAD), or `wake-word`. */
  InputTrigger: 'voice.input.trigger',
  /** `committed`, `drafted`, `cancelled`, or `failed`. */
  InputOutcome: 'voice.input.outcome',
  InputReason: 'voice.input.reason',
  WakeCharacterId: 'voice.wake.character_id',
  WakeText: 'voice.wake.text',
  WakeTokens: 'voice.wake.tokens',
  SpeechDurationMs: 'voice.speech.duration_ms',
  VADAborted: 'voice.vad.aborted',
  SpeakerScore: 'voice.speaker.score',
  SpeakerScores: 'voice.speaker.scores',
  SpeakerVoicedMs: 'voice.speaker.voiced_ms',
  SpeakerRejectedCount: 'voice.speaker.rejected_count',
  ASRText: 'asr.text',
  EndpointTranscriptLength: 'endpoint.transcript_length',
  RephraseSegmentCount: 'rephrase.segment_count',
  RephraseChangedCount: 'rephrase.changed_count',
  TTSText: 'tts.text',
  TTSChunkReason: 'tts.chunk_reason',
  TTSAudioDurationMs: 'tts.audio_duration_ms',
  TTSTtfbMs: 'tts.ttfb_ms',
  TurnAddressees: 'turn.addressees',
  FloorSelection: 'floor.selection',
  FloorTakeReason: 'floor.take.reason',
  Interrupter: 'interrupter',
  Interrupted: 'interrupted',
  OverlapIntent: 'overlap.intent',
  OverlapResponse: 'overlap.response',
  HeardFrames: 'heard.frames',
  PlannedFrames: 'planned.frames',
  HeardChars: 'heard.chars',
  HeardText: 'heard.text',
  HeardMethod: 'heard.method',
} as const

const participantStates = ['initializing', 'idle', 'listening', 'thinking', 'waiting', 'speaking', 'away']

export const voiceProfile = defineProfile({
  key: 'voice',
  version: '1',
  label: { 'en': 'Voice', 'zh-Hans': '语音' },
  description: {
    'en': 'A conversation with any number of participants: speech, recognition, end of turn, synthesis, and playback.',
    'zh-Hans': '任意人数参与的对话：说话、识别、轮次结束、合成与播放。',
  },
  tracks: [
    defineTrack({ path: VoiceTracks.State, entity: 'actor', group: 'participants', order: 0, render: ['state'], states: participantStates, label: { 'en': 'State', 'zh-Hans': '状态' } }),
    defineTrack({ path: VoiceTracks.Wake, entity: 'actor', activity: 'thinking', group: 'participants', order: 10, render: ['spans'], color: '#d946ef', icon: 'i-mingcute:bell-ringing-line', label: { 'en': 'Wake word', 'zh-Hans': '唤醒词' } }),
    defineTrack({ path: VoiceTracks.Input, entity: 'actor', activity: 'waiting', group: 'participants', order: 20, render: ['spans', 'series'], unit: 'level', retention: { keep: 'window', maxHz: 40 }, color: '#6366f1', icon: 'i-mingcute:voice-line', label: { 'en': 'Voice input', 'zh-Hans': '语音输入' } }),
    defineTrack({ path: VoiceTracks.Speech, entity: 'actor', activity: 'active', group: 'participants', order: 30, render: ['spans', 'instants'], color: '#f59e0b', icon: 'i-mingcute:sound-line-line', label: { 'en': 'Speech', 'zh-Hans': '说话' } }),
    defineTrack({ path: VoiceTracks.ASR, entity: 'actor', activity: 'thinking', group: 'participants', order: 40, render: ['spans', 'instants'], color: '#3b82f6', icon: 'i-mingcute:mic-line', label: { 'en': 'Speech recognition', 'zh-Hans': '语音识别' } }),
    defineTrack({ path: VoiceTracks.Rephrase, entity: 'actor', activity: 'thinking', group: 'participants', order: 45, render: ['spans'], color: '#14b8a6', icon: 'i-mingcute:edit-2-line', label: { 'en': 'Rephrase', 'zh-Hans': '改写' } }),
    defineTrack({ path: VoiceTracks.Text, entity: 'actor', group: 'participants', order: 50, render: ['instants'], label: { 'en': 'Text', 'zh-Hans': '文本' } }),
    defineTrack({ path: VoiceTracks.Output, entity: 'actor', activity: 'waiting', group: 'participants', order: 60, render: ['spans'], color: '#64748b', icon: 'i-mingcute:message-3-line', label: { 'en': 'Speech output', 'zh-Hans': '语音输出' } }),
    defineTrack({ path: VoiceTracks.TTS, entity: 'actor', activity: 'thinking', group: 'participants', order: 70, render: ['spans', 'instants'], color: '#22c55e', icon: 'i-mingcute:voice-2-line', label: { 'en': 'TTS', 'zh-Hans': '语音合成' } }),
    defineTrack({ path: VoiceTracks.Playback, entity: 'actor', activity: 'active', group: 'participants', order: 80, render: ['spans', 'state', 'series'], unit: 'level', retention: { keep: 'window', maxHz: 40 }, states: ['idle', 'playing', 'paused'], color: '#06b6d4', icon: 'i-mingcute:play-line', label: { 'en': 'Playback', 'zh-Hans': '播放' } }),
    defineTrack({ path: VoiceTracks.Floor, entity: 'conversation', group: 'conversations', order: 0, render: ['instants'], label: { 'en': 'Floor', 'zh-Hans': '话轮' } }),
    defineTrack({ path: VoiceTracks.Endpoint, entity: 'conversation', activity: 'thinking', group: 'conversations', order: 10, render: ['spans', 'instants'], color: '#f97316', icon: 'i-mingcute:balance-line', label: { 'en': 'End of turn', 'zh-Hans': '轮次结束' } }),
    defineTrack({ path: VoiceTracks.Speculation, entity: 'conversation', group: 'conversations', order: 20, render: ['state'], states: ['open', 'holding', 'dropping'], label: { 'en': 'Speculation', 'zh-Hans': '预测' } }),
  ],
  idKeys: Object.values(VoiceIdKeys).map(key => defineIdKey({ key })),
  attributes: [
    defineAttribute({ key: VoiceAttributes.ASRText, type: 'string', sensitivity: 'content' }),
    defineAttribute({ key: VoiceAttributes.TTSText, type: 'string', sensitivity: 'content' }),
    defineAttribute({ key: VoiceAttributes.HeardText, type: 'string', sensitivity: 'content' }),
    defineAttribute({ key: VoiceAttributes.WakeText, type: 'string', sensitivity: 'content' }),
    defineAttribute({ key: VoiceAttributes.TTSTtfbMs, type: 'number', unit: 'ms', sensitivity: 'none', aggregatable: true }),
    defineAttribute({ key: VoiceAttributes.TTSAudioDurationMs, type: 'number', unit: 'ms', sensitivity: 'none', aggregatable: true }),
    defineAttribute({ key: VoiceAttributes.SpeechDurationMs, type: 'number', unit: 'ms', sensitivity: 'none', aggregatable: true }),
  ],
  endReasons: [
    defineEndReason({ reason: 'interrupted', label: { 'en': 'Interrupted', 'zh-Hans': '被打断' } }),
    defineEndReason({ reason: 'no-audio', label: { 'en': 'No audio', 'zh-Hans': '无音频' } }),
  ],
  metrics: [
    defineMetric({
      key: 'voice.response_latency',
      label: { 'en': 'Response latency', 'zh-Hans': '响应延迟' },
      description: {
        'en': 'From the speech end of the previous speaker to the first audible frame of the next speaker.',
        'zh-Hans': '从上一位说话人说完，到下一位说话人第一帧可听见的声音。',
      },
      unit: 'ms',
      better: 'lower',
      dimensions: ['from', 'to'],
      value: { kind: 'derived', projection: 'voice.floor-transfer' },
    }),
    defineMetric({
      key: 'voice.floor_transfer_offset',
      label: { 'en': 'Floor transfer offset', 'zh-Hans': '话轮交接间隔' },
      description: {
        'en': 'The speech start of the next speaker minus the speech end of the previous speaker. A negative value is an overlap.',
        'zh-Hans': '下一位说话人开始说话的时间减去上一位说完的时间。负值表示重叠。',
      },
      unit: 'ms',
      dimensions: ['from', 'to'],
      aggregate: ['p50', 'p95', 'count'],
      value: { kind: 'derived', projection: 'voice.floor-transfer' },
    }),
    defineMetric({
      key: 'tts.ttfb_ms',
      label: { 'en': 'TTS first byte', 'zh-Hans': 'TTS 首字节' },
      description: { 'en': 'From the TTS request to the first audio byte.', 'zh-Hans': '从发出 TTS 请求到收到第一个音频字节。' },
      unit: 'ms',
      better: 'lower',
      value: { kind: 'attribute', track: VoiceTracks.TTS, record: 'span.end', attribute: VoiceAttributes.TTSTtfbMs },
    }),
    defineMetric({
      key: 'voice.endpoint_latency',
      label: { 'en': 'End-of-turn decision', 'zh-Hans': '轮次结束判断耗时' },
      description: { 'en': 'How long one end-of-turn decision took.', 'zh-Hans': '一次轮次结束判断用了多久。' },
      unit: 'ms',
      better: 'lower',
      value: { kind: 'attribute', track: VoiceTracks.Endpoint, record: 'span.end', attribute: ATTR_DECISION_LATENCY_MS },
    }),
  ],
  pipelines: [
    definePipeline({
      key: 'voice.turn',
      label: { 'en': 'Voice turn', 'zh-Hans': '语音轮次' },
      stages: [
        { key: 'wake', label: { 'en': 'Wake word', 'zh-Hans': '唤醒词' }, tracks: [VoiceTracks.Wake] },
        { key: 'input', label: { 'en': 'Input', 'zh-Hans': '输入' }, tracks: [VoiceTracks.Input, VoiceTracks.Speech] },
        { key: 'asr', label: { 'en': 'Recognition', 'zh-Hans': '识别' }, tracks: [VoiceTracks.ASR] },
        { key: 'endpoint', label: { 'en': 'End of turn', 'zh-Hans': '轮次结束' }, tracks: [VoiceTracks.Endpoint, VoiceTracks.Rephrase] },
        { key: 'agent', label: { 'en': 'Agent', 'zh-Hans': '智能体' }, tracks: ['agents/{agent}/turn', 'agents/{agent}/llm'] },
        { key: 'tts', label: { 'en': 'Synthesis', 'zh-Hans': '合成' }, tracks: [VoiceTracks.Output, VoiceTracks.TTS] },
        { key: 'playback', label: { 'en': 'Playback', 'zh-Hans': '播放' }, tracks: [VoiceTracks.Playback] },
      ],
      edges: [
        { from: 'wake', to: 'input', kind: TraceEdgeKinds.Signal, name: 'wake' },
        { from: 'input', to: 'asr', kind: TraceEdgeKinds.Audio, name: 'speech' },
        { from: 'asr', to: 'endpoint', kind: TraceEdgeKinds.Data, name: 'transcript' },
        { from: 'endpoint', to: 'agent', kind: TraceEdgeKinds.Command, name: 'submit' },
        { from: 'agent', to: 'tts', kind: TraceEdgeKinds.Data, name: 'text' },
        { from: 'tts', to: 'playback', kind: TraceEdgeKinds.Audio, name: 'audio' },
        { from: 'playback', to: 'input', kind: TraceEdgeKinds.Signal, name: 'barge-in' },
      ],
    }),
  ],
  presets: [
    definePreset({ key: 'voice.turn', label: { 'en': 'Voice turn', 'zh-Hans': '语音轮次' }, tracks: ['participants/{actor}/*', 'conversations/{conversation}/*', 'agents/{agent}/*'] }),
    definePreset({ key: 'voice.barge-in', label: { 'en': 'Barge-in', 'zh-Hans': '插话' }, tracks: [VoiceTracks.Input, VoiceTracks.Speech, VoiceTracks.Playback, VoiceTracks.Floor, VoiceTracks.Endpoint] }),
  ],
})

/** A track path that holds speech of one participant: detected speech, or played audio of an agent. */
function speakerOf(track: string): string | undefined {
  return matchTrackPath(VoiceTracks.Speech, track)?.actor ?? matchTrackPath(VoiceTracks.Playback, track)?.actor
}

interface FloorState {
  /** The participant who spoke last, and the end of that speech. `end` is undefined while the speech runs. */
  last?: { actor: string, end?: number }
  /** Open speech spans by span key, so an end finds its actor. */
  open: Map<string, string>
  samples: MetricSamples
}

/**
 * Derives floor transfers from speech and playback spans.
 *
 * A transfer from A to B happens when B starts to speak and the last speaker was A. Its offset is the speech start of
 * B minus the speech end of A. For an agent, speech starts at its first played audio. A playback segment that follows
 * another segment of the same agent is the same turn, so it is not a transfer.
 * A start while A still speaks is an overlap. It is not a transfer, and the interruption metrics cover it.
 */
export function createFloorTransferProjection(): TraceProjection<FloorState, MetricSamples> {
  return {
    key: 'voice.floor-transfer',
    reset: () => ({ open: new Map(), samples: {} }),
    handleRecord(state, record: TraceRecord, context) {
      if (record.type !== 'span.begin' && record.type !== 'span.end')
        return state
      const actor = speakerOf(record.track)
      if (!actor)
        return state
      const key = spanKeyOf(record.source, record.epoch, record.spanId)

      if (record.type === 'span.begin') {
        if (state.open.has(key))
          return state
        state.open.set(key, actor)
        const last = state.last
        if (last && last.actor !== actor && last.end !== undefined) {
          const sample: MetricSample = { time: context.time, value: context.time - last.end, dimensions: { from: last.actor, to: actor } }
          ;(state.samples['voice.floor_transfer_offset'] ??= []).push(sample)
          if (sample.value >= 0)
            (state.samples['voice.response_latency'] ??= []).push(sample)
        }
        if (!last || last.actor !== actor || last.end !== undefined)
          state.last = { actor, end: undefined }
        return state
      }

      if (!state.open.delete(key))
        return state
      const stillSpeaking = [...state.open.values()].includes(actor)
      if (state.last?.actor === actor && !stillSpeaking)
        state.last.end = context.time
      return state
    },
    evict(state, range) {
      for (const [key, list] of Object.entries(state.samples))
        state.samples[key] = list.filter(sample => sample.time > range.to)
      return state
    },
    select: state => state.samples,
  }
}
