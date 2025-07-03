import type { InvokeArgs, InvokeOptions } from '@tauri-apps/api/core'

import { invoke as tauriInvoke } from '@tauri-apps/api/core'

export interface InvokeMethods {
  // app windows
  'open_settings_window': { args: undefined, options: undefined, returns: void }
  'open_chat_window': { args: undefined, options: undefined, returns: void }

  // Plugin - Audio Transcription
  'plugin:proj-airi-tauri-plugin-audio-transcription|load_model_whisper': { args: { modelType: 'base' | 'largev3' | 'tiny' | 'medium' }, options: undefined, returns: void }
  'plugin:proj-airi-tauri-plugin-audio-transcription|audio_transcription': { args: { chunk: number[], language: string }, options: undefined, returns: [string, string] }

  // Plugin - Audio VAD
  'plugin:proj-airi-tauri-plugin-audio-vad|load_model_silero_vad': { args: undefined, options: undefined, returns: void }
  'plugin:proj-airi-tauri-plugin-audio-vad|audio_vad': { args: { inputData: { input: number[], sr: number, state: number[] } }, options: undefined, returns: number }

  // Plugin - Window Pass through on hover
  'plugin:proj-airi-tauri-plugin-window-pass-through-on-hover|start_monitor': { args: undefined, options: undefined, returns: void }
  'plugin:proj-airi-tauri-plugin-window-pass-through-on-hover|stop_monitor': { args: undefined, options: undefined, returns: void }
  'plugin:proj-airi-tauri-plugin-window-pass-through-on-hover|start_pass_through': { args: undefined, options: undefined, returns: void }
  'plugin:proj-airi-tauri-plugin-window-pass-through-on-hover|stop_pass_through': { args: undefined, options: undefined, returns: void }

  // Plugin - WindowRouterLink
  'plugin:proj-airi-tauri-plugin-window-router-link|go': {
    args: { route: string, windowLabel?: string } | undefined
    options: undefined
    returns: void
  }
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
