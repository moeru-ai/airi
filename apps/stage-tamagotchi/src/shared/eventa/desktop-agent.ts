import { defineInvokeEventa } from '@moeru/eventa'

/**
 * Contracts for the desktop agent.
 *
 * The renderer exposes these as LLM tools, and the main process runs them. One
 * contract per capability keeps each payload reviewable, which matters because
 * every one of them reaches the local machine.
 *
 * The main process re-checks each path against the workspace root. The renderer
 * cannot widen the boundary.
 */

/** Lists one directory. `isDirectory` is a field, not a method, so it survives IPC. */
export interface DesktopAgentFsListResult {
  entries: Array<{ name: string, isDirectory: boolean }>
}

/** Reads a text file with the platform encoding as UTF-8. */
export interface DesktopAgentFsReadResult {
  text: string
}

/** Writes a text file. */
export interface DesktopAgentFsWriteResult {
  ok: true
}

export const desktopAgentFsList = defineInvokeEventa<DesktopAgentFsListResult, { path: string }>('eventa:invoke:desktop-agent:fs-list')
export const desktopAgentFsRead = defineInvokeEventa<DesktopAgentFsReadResult, { path: string }>('eventa:invoke:desktop-agent:fs-read')
export const desktopAgentFsWrite = defineInvokeEventa<DesktopAgentFsWriteResult, { path: string, text: string }>('eventa:invoke:desktop-agent:fs-write')

/** The outcome of one child process. A timeout is reported, never thrown. */
export interface DesktopAgentExecResult {
  exitCode: number
  stdout: string
  stderr: string
  timedOut: boolean
}

export const desktopAgentExec = defineInvokeEventa<DesktopAgentExecResult, { command: string, args: string[], cwd: string, timeoutMs: number }>('eventa:invoke:desktop-agent:exec')

/** One screen capture. `dataUrl` holds the PNG only when the caller asked for it. */
export interface DesktopAgentScreenshotResult {
  width: number
  height: number
  dataUrl?: string
}

export const desktopAgentScreenshot = defineInvokeEventa<DesktopAgentScreenshotResult, { withData: boolean }>('eventa:invoke:desktop-agent:screenshot')

/** A visible window title, in the order the window manager reports it. */
export interface DesktopAgentWindowListResult {
  titles: string[]
}

export interface DesktopAgentWindowFocusResult {
  text: string
}

export const desktopAgentWindowList = defineInvokeEventa<DesktopAgentWindowListResult>('eventa:invoke:desktop-agent:window-list')
export const desktopAgentWindowFocus = defineInvokeEventa<DesktopAgentWindowFocusResult, { title: string }>('eventa:invoke:desktop-agent:window-focus')

/** Opens a URL or a program name. The main process reads the flag, not the shape. */
export interface DesktopAgentOpenResult {
  text: string
}

export const desktopAgentOpen = defineInvokeEventa<DesktopAgentOpenResult, { target: string, isUrl: boolean }>('eventa:invoke:desktop-agent:open')

/** The pointer position and the display scale that maps logical pixels to physical ones. */
export interface DesktopAgentCursorResult {
  x: number
  y: number
  scale: number
}

export const desktopAgentCursor = defineInvokeEventa<DesktopAgentCursorResult>('eventa:invoke:desktop-agent:cursor')

export interface DesktopAgentInputResult {
  ok: true
}

export const desktopAgentMouseMove = defineInvokeEventa<DesktopAgentInputResult, { x: number, y: number }>('eventa:invoke:desktop-agent:mouse-move')
export const desktopAgentMouseClick = defineInvokeEventa<DesktopAgentInputResult, { button: 'left' | 'right' | 'middle', double: boolean }>('eventa:invoke:desktop-agent:mouse-click')
export const desktopAgentKeyboardType = defineInvokeEventa<DesktopAgentInputResult, { text: string }>('eventa:invoke:desktop-agent:keyboard-type')
export const desktopAgentKeyboardPress = defineInvokeEventa<DesktopAgentInputResult, { keys: string[] }>('eventa:invoke:desktop-agent:keyboard-press')

/** The folder the file tools reach. The panel shows it, and the host stores it. */
export interface DesktopAgentWorkspaceResult {
  workspace: string
}

export const desktopAgentGetWorkspace = defineInvokeEventa<DesktopAgentWorkspaceResult>('eventa:invoke:desktop-agent:get-workspace')
export const desktopAgentSetWorkspace = defineInvokeEventa<DesktopAgentWorkspaceResult, { workspace: string }>('eventa:invoke:desktop-agent:set-workspace')

/** Opens the folder picker. `workspace` is empty when the user cancels. */
export const desktopAgentPickWorkspace = defineInvokeEventa<DesktopAgentWorkspaceResult>('eventa:invoke:desktop-agent:pick-workspace')

/** Shows the workspace folder in the system file manager. */
export const desktopAgentRevealWorkspace = defineInvokeEventa<void>('eventa:invoke:desktop-agent:reveal-workspace')
