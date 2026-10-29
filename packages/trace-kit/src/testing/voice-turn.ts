import type { TraceRecordInput } from '../core/types'

import recording from './fixtures/long-leading-silence.json'

import { trackPath } from '../core/define'
import { AgentNames, AgentTracks } from '../profiles/agent'
import { VoiceAttributes, VoiceNames, VoiceSeries, VoiceTracks } from '../profiles/voice'

/**
 * A real recording: the level and the VAD probability of each 32 ms detector window of 5.3 s of speech.
 *
 * The values come from the AIRI Silero VAD model and `levelOf` of stage-ui, run on
 * `cases/long-leading-silence/input.test.wav` of `@proj-airi/testing-audio`. The probability is near 0 in silence,
 * jumps to near 1 within one or two windows, and dips between words. The speech starts at 884 ms.
 */
export const LONG_LEADING_SILENCE: { intervalMs: number, times: number[], level: number[], probability: number[] } = recording

/** The trace clock times of the voice turn of {@link voiceTurnRecords}, in milliseconds. */
export const VOICE_TURN = {
  inputStart: 200,
  speechStart: 1084,
  inputEnd: 5500,
  playbackStart: 7000,
  playbackEnd: 10_000,
  /** A second model request starts here and stays open. */
  openRequestStart: 10_200,
  end: 12_000,
} as const

/**
 * Records of one voice turn, for tests and stories of trace views. The trace has every kind of item that the IO
 * tracer draws:
 *
 * - A voice input with the level and the VAD probability of {@link LONG_LEADING_SILENCE}, and two speech segments.
 * - A failed speech recognition and its retry.
 * - A chat turn, a model request with tokens and a first chunk, and a labelled tool call.
 * - A speech output, a TTS request, and a playback with a level series.
 * - Participant states, floor instants, and a model request that is still open at the end.
 */
export function voiceTurnRecords(): TraceRecordInput[] {
  const user = { actor: 'user' }
  const agent = { actor: 'agent' }
  const input = { ...user, input: 'i1', conversation: 'c1' }
  const turn = { turn: 'i1', conversation: 'c1' }
  const at = VOICE_TURN
  const userTrack = (path: string) => trackPath(path, user)
  const agentTrack = (path: string) => trackPath(path, agent)
  const llm = trackPath(AgentTracks.LLM, { agent: 'agent' })
  // The playback replays the speech of the recording, from its start.
  const played = recording.times.flatMap((time, index) => time >= 884 && time - 884 < at.playbackEnd - at.playbackStart ? [index] : [])

  return [
    { type: 'state', ts: 0, track: userTrack(VoiceTracks.State), value: 'idle', ids: user },
    { type: 'state', ts: at.inputStart, track: userTrack(VoiceTracks.State), value: 'listening', from: 'idle', ids: user },
    { type: 'state', ts: at.speechStart, track: userTrack(VoiceTracks.State), value: 'speaking', from: 'listening', ids: user },
    { type: 'state', ts: at.inputEnd, track: userTrack(VoiceTracks.State), value: 'waiting', from: 'speaking', ids: user },

    { type: 'span.begin', ts: at.inputStart, track: userTrack(VoiceTracks.Input), spanId: 'input', name: VoiceNames.VoiceInput, ids: input, attrs: { [VoiceAttributes.InputTrigger]: 'speech' } },
    { type: 'sample.chunk', ts: at.inputStart, track: userTrack(VoiceTracks.Input), ids: user, offsetsMs: recording.times, values: { [VoiceSeries.Level]: recording.level, [VoiceSeries.Probability]: recording.probability } },
    { type: 'span.begin', ts: at.speechStart, track: userTrack(VoiceTracks.Speech), spanId: 'speech-1', name: VoiceNames.SpeechSegment, ids: input },
    { type: 'instant', ts: at.speechStart, track: trackPath(VoiceTracks.Floor, { conversation: 'c1' }), name: VoiceNames.FloorTaken, attrs: { actor: 'user' } },
    { type: 'span.end', ts: 2748, track: userTrack(VoiceTracks.Speech), spanId: 'speech-1', status: 'ok' },
    { type: 'span.begin', ts: 3964, track: userTrack(VoiceTracks.Speech), spanId: 'speech-2', name: VoiceNames.SpeechSegment, ids: input },
    { type: 'span.end', ts: 4764, track: userTrack(VoiceTracks.Speech), spanId: 'speech-2', status: 'ok' },

    { type: 'span.begin', ts: 4764, track: userTrack(VoiceTracks.ASR), spanId: 'asr-1', name: VoiceNames.SpeechRecognition, ids: input },
    { type: 'span.end', ts: 5150, track: userTrack(VoiceTracks.ASR), spanId: 'asr-1', status: 'error', reason: 'provider failed' },
    { type: 'span.begin', ts: 5150, track: userTrack(VoiceTracks.ASR), spanId: 'asr-2', name: VoiceNames.SpeechRecognition, ids: input, links: [{ rel: 'retry-of', to: { spanId: 'asr-1' } }] },
    { type: 'span.end', ts: at.inputEnd, track: userTrack(VoiceTracks.ASR), spanId: 'asr-2', status: 'ok' },
    { type: 'span.end', ts: at.inputEnd, track: userTrack(VoiceTracks.Input), spanId: 'input', status: 'ok' },

    { type: 'span.begin', ts: at.inputEnd, track: trackPath(AgentTracks.Turn, { agent: 'agent' }), spanId: 'turn', name: AgentNames.ChatTurn, ids: turn, links: [{ rel: 'caused-by', to: { spanId: 'input' } }] },
    { type: 'span.begin', ts: 5550, track: llm, spanId: 'llm-1', parentSpanId: 'turn', name: AgentNames.ModelRequest, ids: turn, attrs: { 'gen_ai.request.model': 'demo-model' } },
    { type: 'instant', ts: 6100, track: llm, spanId: 'llm-1', name: AgentNames.LLMFirstChunk },
    { type: 'span.begin', ts: 6200, track: trackPath(AgentTracks.Tools, { agent: 'agent' }), spanId: 'tool-1', parentSpanId: 'llm-1', name: 'web_search', ids: turn },
    { type: 'span.end', ts: 6600, track: trackPath(AgentTracks.Tools, { agent: 'agent' }), spanId: 'tool-1', status: 'ok' },
    { type: 'span.end', ts: 6800, track: llm, spanId: 'llm-1', status: 'ok', attrs: { 'gen_ai.usage.input_tokens': 1200, 'gen_ai.usage.output_tokens': 86 } },

    { type: 'span.begin', ts: at.inputEnd, track: agentTrack(VoiceTracks.Output), spanId: 'output', name: VoiceNames.SpeechOutput, ids: { ...agent, ...turn } },
    { type: 'span.begin', ts: 6800, track: agentTrack(VoiceTracks.TTS), spanId: 'tts-1', name: VoiceNames.TTSRequest, ids: { ...agent, ...turn, segment: 's1' } },
    { type: 'span.end', ts: at.playbackStart, track: agentTrack(VoiceTracks.TTS), spanId: 'tts-1', status: 'ok' },
    { type: 'span.end', ts: at.playbackStart, track: trackPath(AgentTracks.Turn, { agent: 'agent' }), spanId: 'turn', status: 'ok' },
    { type: 'span.begin', ts: at.playbackStart, track: agentTrack(VoiceTracks.Playback), spanId: 'playback-1', name: VoiceNames.Playback, ids: { ...agent, ...turn, segment: 's1' } },
    { type: 'instant', ts: at.playbackStart, track: trackPath(VoiceTracks.Floor, { conversation: 'c1' }), name: VoiceNames.FloorTaken, attrs: { actor: 'agent' } },
    { type: 'sample.chunk', ts: at.playbackStart, track: agentTrack(VoiceTracks.Playback), ids: agent, offsetsMs: played.map(index => recording.times[index]! - 884), values: { [VoiceSeries.Level]: played.map(index => recording.level[index]!) } },
    { type: 'span.end', ts: at.playbackEnd, track: agentTrack(VoiceTracks.Playback), spanId: 'playback-1', status: 'ok' },
    { type: 'span.end', ts: at.playbackEnd, track: agentTrack(VoiceTracks.Output), spanId: 'output', status: 'ok' },

    { type: 'span.begin', ts: at.openRequestStart, track: llm, spanId: 'llm-2', name: AgentNames.ModelRequest, ids: { turn: 'i2', conversation: 'c1' } },
  ]
}
