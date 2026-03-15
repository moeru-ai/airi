export type PluginTransport
  = | { kind: 'in-memory' }
    | { kind: 'websocket', url: string, protocols?: string[] }
    | { kind: 'web-worker', worker: Worker }
    | { kind: 'node-worker', worker: import('node:worker_threads').Worker }
    | { kind: 'electron', target: 'main' | 'renderer', webContentsId?: number }
