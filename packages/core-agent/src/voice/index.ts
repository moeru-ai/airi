// Public voice API. Internal ports, such as `SpeechInputAttemptOwner`, stay inside this directory.

export { VoiceController } from './controller'
export type { VoiceControllerOptions } from './controller'
export { SpeechInputAttempt } from './input/attempt'
export type { ConversationContext, SpeechInputPorts, StreamingTranscriber } from './input/ports'
export { SpeechInput } from './input/speech-input'
export type {
  TranscriptEdit,
  TranscriptionEvent,
  TranscriptPatch,
  TranscriptSegment,
  TranscriptSnapshot,
  TranscriptToken,
  WriteResult,
} from './input/transcript'
export type {
  BeginSpeechInput,
  SpeakerEvidence,
  SpeechContextEntry,
  SpeechInputAttemptOutcome,
  SpeechInputAttemptState,
  SpeechSubmission,
  TranscriptDocument,
} from './input/types'
export type { Interruption, VoiceInterruptionEvent } from './interruption'
export { SpeechStream, VoiceResponse } from './output/response'
export type { SpeechAudio, SpeechClip, SpeechClipEnd, SpeechOutput } from './output/response'
export { defaultSpeechPreprocessors, toSpeechText } from './output/speech-transformation'
export type { SpeechTextOptions } from './output/speech-transformation'
export { mathSpeech, mathSpeechPreprocessor, moneySpeechPreprocessor, speakMath, toMathJson } from './output/speech-transformation/preprocessor'
export type { SpeechFormulaContext, SpeechPreprocessor, SpeechProseContext } from './output/speech-transformation/preprocessor'
export type {
  AudioPluginTask,
  FinalizeContext,
  FinalizeOptions,
  SpeechInputControl,
  SpeechInputScope,
  TranscriptWatchOptions,
  VoicePlugin,
  VoicePluginControls,
  VoicePluginError,
  VoicePluginHandle,
  VoicePluginScope,
  VoicePluginSettings,
} from './plugins/types'
export { emission, isEvent, VoicePolicy } from './policy/engine'
export type { VoiceEventContext, VoicePolicyOptions } from './policy/engine'
export {
  endJudgedSignal,
  inputActivitySignal,
  inputBegunEvent,
  inputCapturingEvent,
  inputFinalizingEvent,
  inputSettledEvent,
  inputTranscriptEvent,
  pausedSignal,
  speechActivitySignal,
} from './policy/events'
export { createEndJudgementRule, createPauseRule, createSpeechActivityRule } from './policy/rules'
export type { PauseRuleOptions, SpeechActivityRuleOptions } from './policy/rules'
export type { Emission, InputRevisions, RevisionMetadata, RuleContext, RuleStep, VoiceCommand, VoiceRule } from './policy/types'
export { turnKey } from './turn'
export type { TurnRef } from './turn'
