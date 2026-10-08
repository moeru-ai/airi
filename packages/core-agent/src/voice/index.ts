// Public voice API. Internal ports, such as `SpeechInputAttemptOwner`, stay inside this directory.

export { VoiceController } from './controller'
export type { VoiceControllerOptions } from './controller'
export { SpeechInputAttempt } from './input/attempt'
export type { BeginSpeechInput, SpeechInputAttemptOutcome, SpeechInputAttemptState } from './input/attempt-types'
export type { EndDetectionOptions, EndDetector, SpeechActivityEvidence, TurnEvidence } from './input/end-detection'
export type { SpeakerEvidence, SpeechSelection, SpeechSnapshot } from './input/snapshot'
export { SpeechInput } from './input/speech-input'
export type { SpeechInputPorts, SpeechSubmission, StreamingTranscriber } from './input/submission'
export type {
  TranscriptEdit,
  TranscriptionEvent,
  TranscriptPatch,
  TranscriptSegment,
  TranscriptSnapshot,
  TranscriptToken,
  WriteResult,
} from './input/transcript'
export type { Interruption, VoiceInterruptionEvent } from './interruption'
export { SpeechStream, VoiceResponse } from './output/response'
export type { SpeechAudio, SpeechClip, SpeechClipEnd, SpeechOutput } from './output/response'
export type {
  AudioPluginTask,
  ContextWriter,
  SpeechInputControl,
  SpeechInputScope,
  SpeechLifecycleTask,
  SpeechSubscription,
  SpeechTask,
  SpeechView,
  TranscriptionEnd,
  VoicePlugin,
  VoicePluginControls,
  VoicePluginError,
  VoicePluginHandle,
  VoicePluginScope,
  VoicePluginSettings,
} from './plugins/types'
export { turnKey } from './turn'
export type { TurnRef } from './turn'
