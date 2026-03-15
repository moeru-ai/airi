/**
 * PTY-based interactive terminal runner.
 *
 * Uses node-pty to allocate a real pseudo-terminal, allowing interaction
 * with TUI programs (vim, htop, tmux, etc.) that require a terminal
 * device rather than piped stdin/stdout.
 *
 * The dependency is lazy-loaded so environments that do not touch PTY code
 * do not pay the startup cost, but `node-pty` is a formal package dependency
 * of computer-use-mcp and should normally be present.
 */

import type { ComputerUseConfig } from '../types'

import { createRequire } from 'node:module'
import { env, kill, cwd as processCwd } from 'node:process'

// NOTICE: node-pty is loaded lazily because it is a native module, but it is
// expected to be installed as a normal dependency for PTY support.
let nodePty: any
let nodePtyLoaded = false
let nodePtyLoadError: string | undefined

const NODE_PTY_MODULE = 'node-pty'
const requireNodeModule = createRequire(import.meta.url)

function stringifyLoadError(error: unknown) {
  return error instanceof Error ? error.stack || error.message : String(error)
}

async function loadNodePty() {
  if (nodePtyLoaded)
    return nodePty
  nodePtyLoaded = true

  const loadErrors: string[] = []
  try {
    // NOTICE: Prefer CommonJS resolution for native addons. `node-pty` is a
    // CJS package with native bindings and `createRequire()` is materially more
    // reliable than ESM dynamic import when the server is launched underneath
    // Electron + tsx child processes.
    nodePty = requireNodeModule(NODE_PTY_MODULE)
    nodePtyLoadError = undefined
    return nodePty
  }
  catch (error) {
    loadErrors.push(`require(${NODE_PTY_MODULE}) failed:\n${stringifyLoadError(error)}`)
  }

  try {
    nodePty = await import(/* @vite-ignore */ NODE_PTY_MODULE)
    nodePty = nodePty?.default?.spawn && !nodePty?.spawn ? nodePty.default : nodePty
    nodePtyLoadError = undefined
    return nodePty
  }
  catch (error) {
    loadErrors.push(`import(${NODE_PTY_MODULE}) failed:\n${stringifyLoadError(error)}`)
  }

  // node-pty not available — PTY features won't be offered
  nodePtyLoadError = loadErrors.join('\n\n')
  return nodePty
}

export interface PtySession {
  /** Unique session id */
  id: string
  /** Whether the PTY is still alive */
  alive: boolean
  /** Number of rows */
  rows: number
  /** Number of columns */
  cols: number
  /** Current screen content (last snapshot) */
  screenContent: string
  /** Shell process PID */
  pid: number
}

export interface PtyWriteInput {
  /** Data to write to the PTY stdin */
  data: string
}

export interface PtyResizeInput {
  cols: number
  rows: number
}

export interface PtyScreenRequest {
  /** Maximum number of lines to return from the bottom of the scrollback */
  maxLines?: number
}

interface PtyInstance {
  id: string
  pty: any
  buffer: string[]
  /** Maximum scrollback buffer lines to keep */
  maxScrollback: number
  rows: number
  cols: number
}

const sessions = new Map<string, PtyInstance>()
let nextId = 1

/**
 * Whether node-pty is available in this runtime.
 */
export async function isPtyAvailable(): Promise<boolean> {
  await loadNodePty()
  return nodePty !== undefined
}

export async function getPtyAvailabilityInfo(): Promise<{ available: boolean, error?: string }> {
  await loadNodePty()
  return {
    available: nodePty !== undefined,
    ...(nodePtyLoadError ? { error: nodePtyLoadError } : {}),
  }
}

/**
 * Create a new interactive PTY session.
 */
export async function createPtySession(
  config: ComputerUseConfig,
  options?: { rows?: number, cols?: number, cwd?: string },
): Promise<PtySession> {
  await loadNodePty()
  if (!nodePty) {
    throw new Error('node-pty could not be loaded in this runtime. PTY/TUI support is unavailable.')
  }

  const id = `pty_${nextId++}`
  const rows = options?.rows ?? 24
  const cols = options?.cols ?? 80
  const cwd = options?.cwd ?? processCwd()
  const maxScrollback = 5000

  const pty = nodePty.spawn(config.terminalShell, [], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd,
    env: env as Record<string, string>,
  })

  const instance: PtyInstance = {
    id,
    pty,
    buffer: [],
    maxScrollback,
    rows,
    cols,
  }

  pty.onData((data: string) => {
    // Split on newlines and append to scrollback buffer
    const lines = data.split(/\r?\n/)
    for (const line of lines) {
      instance.buffer.push(line)
    }
    // Trim scrollback
    while (instance.buffer.length > maxScrollback) {
      instance.buffer.shift()
    }
  })

  pty.onExit(() => {
    // Keep the session around so the screen can be read after exit
  })

  sessions.set(id, instance)

  return {
    id,
    alive: true,
    rows,
    cols,
    screenContent: '',
    pid: pty.pid,
  }
}

/**
 * Write data (keystrokes) to a PTY session.
 */
export function writeToPty(sessionId: string, input: PtyWriteInput): void {
  const instance = sessions.get(sessionId)
  if (!instance) {
    throw new Error(`PTY session not found: ${sessionId}`)
  }
  instance.pty.write(input.data)
}

/**
 * Resize a PTY session.
 */
export function resizePty(sessionId: string, input: PtyResizeInput): void {
  const instance = sessions.get(sessionId)
  if (!instance) {
    throw new Error(`PTY session not found: ${sessionId}`)
  }
  instance.pty.resize(input.cols, input.rows)
  instance.cols = input.cols
  instance.rows = input.rows
}

/**
 * Read the current screen content of a PTY session.
 */
export function readPtyScreen(sessionId: string, request: PtyScreenRequest = {}): PtySession {
  const instance = sessions.get(sessionId)
  if (!instance) {
    throw new Error(`PTY session not found: ${sessionId}`)
  }

  const maxLines = request.maxLines ?? instance.rows
  const visibleLines = instance.buffer.slice(-maxLines)

  let alive = true
  try {
    // Check if process is still running
    kill(instance.pty.pid, 0)
  }
  catch {
    alive = false
  }

  return {
    id: instance.id,
    alive,
    rows: instance.rows,
    cols: instance.cols,
    screenContent: visibleLines.join('\n'),
    pid: instance.pty.pid,
  }
}

/**
 * List all active PTY sessions.
 */
export function listPtySessions(): PtySession[] {
  const result: PtySession[] = []

  for (const instance of sessions.values()) {
    let alive = true
    try {
      kill(instance.pty.pid, 0)
    }
    catch {
      alive = false
    }

    result.push({
      id: instance.id,
      alive,
      rows: instance.rows,
      cols: instance.cols,
      screenContent: '',
      pid: instance.pty.pid,
    })
  }

  return result
}

/**
 * Destroy a PTY session.
 */
export function destroyPtySession(sessionId: string): boolean {
  const instance = sessions.get(sessionId)
  if (!instance) {
    return false
  }

  try {
    instance.pty.kill()
  }
  catch {
    // Already dead
  }

  sessions.delete(sessionId)
  return true
}

/**
 * Destroy all PTY sessions. Called on server shutdown.
 */
export function destroyAllPtySessions(): void {
  for (const sessionId of [...sessions.keys()]) {
    destroyPtySession(sessionId)
  }
}
