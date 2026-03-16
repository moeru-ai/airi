//#region src/audio-context/index.d.ts
interface State {
  isReady: boolean;
  sampleRate: number;
  error: string;
  isInitializing: boolean;
  workletLoaded: boolean;
  currentTime: number;
  state: AudioContextState;
}
interface WorkletOptions {
  inputSampleRate?: number;
  outputSampleRate?: number;
  channels?: number;
  converterType?: number;
  bufferSize?: number;
}
declare function initializeAudioContext(requestedSampleRate?: number): Promise<AudioContext>;
declare function createAudioSource(mediaStream: MediaStream): MediaStreamAudioSourceNode;
declare function createAudioAnalyser(options?: Partial<{
  fftSize: number;
  smoothingTimeConstant: number;
  minDecibels: number;
  maxDecibels: number;
}>): AnalyserNode;
declare function createAudioGainNode(initialGain?: number): GainNode;
declare function removeAudioSource(source: MediaStreamAudioSourceNode): void;
declare function removeAudioGainNode(gainNode: GainNode): void;
declare function removeAudioAnalyser(analyser: AnalyserNode): void;
declare function suspendAudioContext(): Promise<void>;
declare function resumeAudioContext(): Promise<void>;
declare function createResamplingWorkletNode(inputNode: AudioNode, options?: WorkletOptions): AudioWorkletNode;
declare function removeWorkletNode(node: AudioWorkletNode): void;
declare function cleanupAudioContext(): Promise<void>;
declare function getAudioContextState(): State;
declare function getAudioContext(): AudioContext | undefined;
declare function getCurrentTime(): number;
declare function isAudioContextReady(): boolean;
declare function subscribeToAudioContext(listener: (state: State) => void): () => void;
//#endregion
export { State, WorkletOptions, cleanupAudioContext, createAudioAnalyser, createAudioGainNode, createAudioSource, createResamplingWorkletNode, getAudioContext, getAudioContextState, getCurrentTime, initializeAudioContext, isAudioContextReady, removeAudioAnalyser, removeAudioGainNode, removeAudioSource, removeWorkletNode, resumeAudioContext, subscribeToAudioContext, suspendAudioContext };