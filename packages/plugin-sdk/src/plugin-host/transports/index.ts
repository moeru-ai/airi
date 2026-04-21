/**
 * Describes the transport selected for one plugin host session.
 *
 * Use when:
 * - Creating a plugin context for a specific runtime
 * - Configuring how a plugin communicates with the host
 *
 * Expects:
 * - `kind` matches the runtime-specific adapter chosen by the caller
 *
 * Returns:
 * - A discriminated union describing the active transport and its required handles
 */
export type PluginTransport
  = | { kind: 'in-memory' }
    | { kind: 'websocket', url: string, protocols?: string[] }
    | { kind: 'web-worker', worker: Worker }
    | { kind: 'node-worker', worker: import('node:worker_threads').Worker }
    | { kind: 'electron', target: 'main' | 'renderer', webContentsId?: number }
