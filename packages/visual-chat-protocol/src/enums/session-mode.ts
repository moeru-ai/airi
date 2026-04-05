export const InteractionModes = {
  VisionTextRealtime: 'vision-text-realtime',
} as const

export const SessionStates = {
  Idle: 'idle',
  Connected: 'connected',
  Ready: 'ready',
  Listening: 'listening',
  SelectingSource: 'selecting-source',
  Inference: 'inference',
  Responding: 'responding',
  Suspended: 'suspended',
} as const
