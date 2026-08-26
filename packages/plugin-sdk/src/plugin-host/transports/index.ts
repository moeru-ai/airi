/**
 * Describes the transport selected for one extension host session.
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
  = | { kind: 'electron', target: 'main' | 'renderer', webContentsId?: number }
    | { kind: 'in-memory' }
    | { kind: 'node-worker', worker: import('node:worker_threads').Worker }
    | { kind: 'web-worker', worker: Worker }
    | { kind: 'websocket', protocols?: string[], url: string }
