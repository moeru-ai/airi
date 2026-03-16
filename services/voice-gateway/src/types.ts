// Browser ↔ voice-gateway protocol
export type ClientMessage
  = | { type: 'audio', data: ArrayBuffer }
    | { type: 'control', action: 'start' | 'stop' }
    | { type: 'text', text: string }

export type ServerMessage
  = | { type: 'audio', data: ArrayBuffer }
    | { type: 'audio_task', data: ArrayBuffer }
    | { type: 'asr', text: string, isFinal: boolean }
    | { type: 'chat', text: string }
    | { type: 'chat_ended' }
    | { type: 'task_started', taskText: string }
    | { type: 'task_result', text: string }
    | { type: 'state', state: string }
    | { type: 'error', message: string }
