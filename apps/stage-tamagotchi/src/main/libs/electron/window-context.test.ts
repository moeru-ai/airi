import type { McpManager } from '../../services/airi/mcp-servers'

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { defineInvoke } from '@moeru/eventa'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  electronAppOpenUserDataFolder,
  electronAppQuit,
  electronMcpApplyAndRestart,
  electronMcpCallTool,
  ioTraceRecordingChanged,
  ioTraceRecordingSetEnabled,
} from '../../../shared/eventa'
import { IOTraceRecordingService } from '../../services/airi/io-trace-recording'
import { registerIOTraceRecording } from '../../services/airi/io-trace-recording/register'
import { createMcpServersService } from '../../services/airi/mcp-servers'
import { createAppService } from '../../services/electron/app'
import { createWindowIpc } from './testing/window-ipc'
import { createWindowContext } from './window-context'

const appMock = vi.hoisted(() => ({
  getPath: vi.fn(() => '/tmp/airi-user-data'),
  getVersion: vi.fn(() => '0.0.0'),
  quit: vi.fn(),
}))

const shellMock = vi.hoisted(() => ({
  openPath: vi.fn(async () => ''),
  showItemInFolder: vi.fn(),
}))

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    app: appMock,
    ipcMain: new EventEmitter(),
    shell: shellMock,
  }
})

vi.mock('../bootkit/lifecycle', () => ({
  onAppBeforeQuit: vi.fn(),
}))

function createMcpManagerMock() {
  return {
    ensureConfigFile: vi.fn<McpManager['ensureConfigFile']>(),
    openConfigFile: vi.fn<McpManager['openConfigFile']>(),
    applyAndRestart: vi.fn<McpManager['applyAndRestart']>(async () => ({ path: '', started: [], failed: [], skipped: [] })),
    listTools: vi.fn<McpManager['listTools']>(),
    callTool: vi.fn<McpManager['callTool']>(async () => ({})),
    stopAll: vi.fn<McpManager['stopAll']>(),
    getRuntimeStatus: vi.fn<McpManager['getRuntimeStatus']>(),
    readConfigText: vi.fn<McpManager['readConfigText']>(),
    writeConfigText: vi.fn<McpManager['writeConfigText']>(),
    testServer: vi.fn<McpManager['testServer']>(),
  } satisfies McpManager
}

/**
 * Opens the main, settings, and about windows. Each window gets its own context and registers the same services,
 * as the window setup functions in `src/main/windows` do.
 */
async function openWindows(register: (context: ReturnType<typeof createWindowContext>['context']) => void) {
  const { ipcMain } = await import('electron')
  const windows = [createWindowIpc(ipcMain), createWindowIpc(ipcMain), createWindowIpc(ipcMain)]
  for (const { window } of windows)
    register(createWindowContext(window).context)

  return windows
}

describe('createWindowContext', () => {
  let directory: string

  beforeEach(async () => {
    vi.clearAllMocks()
    const { ipcMain } = await import('electron')
    ipcMain.removeAllListeners()
    directory = await mkdtemp(join(tmpdir(), 'airi-window-context-'))
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  // ROOT CAUSE:
  //
  // One request from one window ran the handler once in each open window. The window contexts did not set
  // `onlySameWindow`, so the Eventa 1.0.2 main adapter did not check the sender on the shared `ipcMain`.
  //
  // We fixed this with `createWindowContext`, which sets `onlySameWindow: true`.
  it('opens the user data folder once when three windows are open and one window requests it', async () => {
    const windows = await openWindows(context => createAppService({ context, window: {} as never }))

    await defineInvoke(windows[1].context, electronAppOpenUserDataFolder)()

    expect(shellMock.openPath).toHaveBeenCalledTimes(1)
  })

  it('quits the app once when one window requests the quit', async () => {
    const windows = await openWindows(context => createAppService({ context, window: {} as never }))

    await defineInvoke(windows[2].context, electronAppQuit)()

    expect(appMock.quit).toHaveBeenCalledTimes(1)
  })

  it('restarts the MCP servers once and calls an MCP tool once for one request', async () => {
    const manager = createMcpManagerMock()
    const windows = await openWindows(context => createMcpServersService({ context, manager }))

    await defineInvoke(windows[1].context, electronMcpApplyAndRestart)()
    await defineInvoke(windows[0].context, electronMcpCallTool)({ name: 'server::tool', arguments: {} })

    expect(manager.applyAndRestart).toHaveBeenCalledTimes(1)
    expect(manager.callTool).toHaveBeenCalledTimes(1)
  })

  it('changes the IO trace recording once and pushes the new state once to each window', async () => {
    const setStoredEnabled = vi.fn()
    const service = new IOTraceRecordingService({ directory, getStoredEnabled: () => false, setStoredEnabled })
    const windows = await openWindows(context => registerIOTraceRecording(context, service))
    const changes = windows.map(() => vi.fn())
    windows.forEach(({ context }, index) => context.on(ioTraceRecordingChanged, changes[index]))

    await defineInvoke(windows[1].context, ioTraceRecordingSetEnabled)({ enabled: true })

    expect(setStoredEnabled).toHaveBeenCalledTimes(1)
    for (const change of changes)
      expect(change).toHaveBeenCalledTimes(1)
  })

  it('stops serving a window after the window closes', async () => {
    const { ipcMain } = await import('electron')
    const windows = await openWindows(context => createAppService({ context, window: {} as never }))

    windows[0].window.emit('closed')

    expect(ipcMain.listenerCount('eventa-message')).toBe(2)
  })
})
