import type { InvokeArgs, InvokeOptions } from '@tauri-apps/api/core'

import { invoke as tauriInvoke } from '@tauri-apps/api/core'

export interface InvokeMethods {
  // app windows
  'open_settings_window': { args: undefined, options: undefined, returns: void }
  'open_chat_window': { args: undefined, options: undefined, returns: void }

  // Plugin - Audio Transcription
  'plugin:ipc-audio-transcription-ort|load_ort_model_whisper': { args: { modelType: 'base' | 'largev3' | 'tiny' | 'medium' }, options: undefined, returns: void }
  'plugin:ipc-audio-transcription-ort|ipc_audio_transcription': { args: { chunk: number[], language: string }, options: undefined, returns: string }

  // Plugin - Audio VAD
  'plugin:ipc-audio-vad-ort|load_ort_model_silero_vad': { args: undefined, options: undefined, returns: void }
  'plugin:ipc-audio-vad-ort|ipc_audio_vad': { args: { inputData: { input: number[], sr: number, state: number[] } }, options: undefined, returns: number }

  // Plugin - Window Pass through on hover
  'plugin:window-pass-through-on-hover|start_tracing_cursor': { args: undefined, options: undefined, returns: void }
  'plugin:window-pass-through-on-hover|stop_tracing_cursor': { args: undefined, options: undefined, returns: void }
}

export interface InvokeMethodShape {
  args: InvokeArgs | undefined
  options: InvokeOptions | undefined
  returns: any
}

export async function invoke<C extends keyof IM, IM extends Record<keyof IM, InvokeMethodShape> = InvokeMethods>(
  command: C,
  args?: IM[C]['args'],
  options?: IM[C]['options'],
): Promise<IM[C]['returns'] | undefined> {
  return await tauriInvoke(command as string, args as InvokeArgs | undefined, options as InvokeOptions | undefined)
}
