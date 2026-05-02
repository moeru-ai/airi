export const WorkerStatuses = {
  Offline: 'offline',
  Starting: 'starting',
  WarmingUp: 'warming-up',
  Ready: 'ready',
  Busy: 'busy',
  Error: 'error',
  ShuttingDown: 'shutting-down',
} as const

export const InferenceBackendTypes = {
  Ollama: 'ollama',
} as const
