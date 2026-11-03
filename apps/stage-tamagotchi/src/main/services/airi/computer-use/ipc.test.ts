import type { ComputerUseResult } from '../../../../shared/eventa/computer-use'

import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { binaryPath } from '@auv-js/cli/binary'
import { defineInvoke } from '@moeru/eventa'
import { createContext as createMainContext } from '@moeru/eventa/adapters/electron/main'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { computerUseReadImage, computerUseRun } from '../../../../shared/eventa/computer-use'
import { emitAppBeforeQuit } from '../../../libs/bootkit/lifecycle'
import { createWindowIpc } from '../../../libs/electron/testing/window-ipc'
import { setupComputerUse } from './index'

const appMock = vi.hoisted(() => ({
  getPath: vi.fn(),
  isPackaged: false,
}))

const sdkMock = vi.hoisted(() => ({
  startAuv: vi.fn(),
}))

vi.mock('electron', () => ({
  app: appMock,
}))

vi.mock('@auv-js/sdk/node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@auv-js/sdk/node')>()
  return {
    ...actual,
    startAuv: (...args: Parameters<typeof actual.startAuv>) => {
      sdkMock.startAuv(...args)
      return actual.startAuv(...args)
    },
  }
})

describe('computer use Electron Main IPC host enforcement gate', () => {
  let directory: string
  let storeRoot: string
  let ipcMain: EventEmitter
  let runViaIpc: (input: { argv: string[] }) => Promise<ComputerUseResult>
  let readImageViaIpc: (input: { path: string }) => Promise<string>

  beforeEach(async () => {
    vi.clearAllMocks()
    directory = await mkdtemp(join(tmpdir(), 'airi-cu-ipc-test-'))
    storeRoot = join(directory, 'store')
    await mkdir(storeRoot)
    appMock.getPath.mockReturnValue(storeRoot)

    // In-memory Electron IPC Main event bus
    ipcMain = new EventEmitter()
    const { context: mainContext } = createMainContext(ipcMain as never)

    // Register host-owned computer-use with test directory
    setupComputerUse(mainContext, {
      binaryPath: binaryPath(),
      storeRoot,
    })

    // Simulated renderer process context
    const { context: rendererContext } = createWindowIpc(ipcMain)
    runViaIpc = defineInvoke(rendererContext, computerUseRun)
    readImageViaIpc = defineInvoke(rendererContext, computerUseReadImage)
  })

  afterEach(async () => {
    await emitAppBeforeQuit()
    await rm(directory, { recursive: true, force: true })
  })

  it('rejects input.clickPoint over IPC without host authorization and executes zero CLI processes', async () => {
    await expect(runViaIpc({ argv: ['invoke', 'input.clickPoint', '100', '200'] })).rejects.toThrow(
      "Mutating desktop operation 'input.clickPoint' is not authorized on this host.",
    )
    expect(sdkMock.startAuv).not.toHaveBeenCalled()
  })

  it('rejects input.typeText and app.activate over IPC and executes zero CLI processes', async () => {
    await expect(runViaIpc({ argv: ['invoke', 'input.typeText', 'hello world'] })).rejects.toThrow(
      "Mutating desktop operation 'input.typeText' is not authorized on this host.",
    )
    await expect(runViaIpc({ argv: ['invoke', 'app.activate', 'Notepad'] })).rejects.toThrow(
      "Mutating desktop operation 'app.activate' is not authorized on this host.",
    )
    await expect(runViaIpc({ argv: ['invoke', 'mediaControl.play'] })).rejects.toThrow(
      "Mutating desktop operation 'mediaControl.play' is not authorized on this host.",
    )
    expect(sdkMock.startAuv).not.toHaveBeenCalled()
  })

  it('does NOT permit renderer to bypass host gate by passing approved: true', async () => {
    const maliciousInput = {
      argv: ['invoke', 'input.clickPoint', '50', '50'],
      approved: true,
      authorization: 'granted',
    } as unknown as { argv: string[] }

    await expect(runViaIpc(maliciousInput)).rejects.toThrow(
      "Mutating desktop operation 'input.clickPoint' is not authorized on this host.",
    )
    expect(sdkMock.startAuv).not.toHaveBeenCalled()
  })

  it('rejects unadmitted commands (scan.* and overlay.*) over IPC with zero CLI processes', async () => {
    await expect(runViaIpc({ argv: ['invoke', 'scan.frame'] })).rejects.toThrow(
      'Use invoke with a desktop command or --help.',
    )
    await expect(runViaIpc({ argv: ['invoke', 'overlay.outline'] })).rejects.toThrow(
      'Use invoke with a desktop command or --help.',
    )
    await expect(runViaIpc({ argv: ['invoke', 'scan.coverage', '--help'] })).rejects.toThrow(
      'Use invoke with a desktop command or --help.',
    )
    expect(sdkMock.startAuv).not.toHaveBeenCalled()
  })

  it('rejects unknown commands and route overrides over IPC', async () => {
    await expect(runViaIpc({ argv: ['invoke', 'input.nonExistentAction'] })).rejects.toThrow(
      'Use invoke with a desktop command or --help.',
    )
    await expect(runViaIpc({ argv: ['invoke', 'window.list', '--store-root', '/etc'] })).rejects.toThrow(
      'Computer use routing and storage are managed by AIRI.',
    )
    expect(sdkMock.startAuv).not.toHaveBeenCalled()
  })

  it('rejects fake help attempts that disguise mutating commands', async () => {
    // Delimiter '--' turns '--help' into a literal positional text argument
    await expect(runViaIpc({ argv: ['invoke', 'input.typeText', '--', '--help'] })).rejects.toThrow(
      "Mutating desktop operation 'input.typeText' is not authorized on this host.",
    )

    // Option assignment containing '--help'
    await expect(runViaIpc({ argv: ['invoke', 'input.typeText', '--target=--help', 'hello'] })).rejects.toThrow(
      "Mutating desktop operation 'input.typeText' is not authorized on this host.",
    )

    expect(sdkMock.startAuv).not.toHaveBeenCalled()
  })

  it('allows safe read-only operations and help queries over IPC', async () => {
    // Root invoke help
    const helpResult = await runViaIpc({ argv: ['invoke', '--help'] })
    expect(helpResult.exitCode).toBe(0)
    expect(typeof helpResult.output).toBe('string')
    expect(helpResult.output).toContain('window.list')

    // Subcommand help on mutating command
    const clickHelp = await runViaIpc({ argv: ['invoke', 'input.clickPoint', '--help'] })
    expect(clickHelp.exitCode).toBe(0)
    expect(clickHelp.output).toContain('Click a point')

    // Read-only window.list help
    const windowHelp = await runViaIpc({ argv: ['invoke', 'window.list', '--help'] })
    expect(windowHelp.exitCode).toBe(0)
    expect(windowHelp.output).toContain('List visible window candidates')

    expect(sdkMock.startAuv).toHaveBeenCalled()
  })

  it('prevents TOCTOU: mutating caller argv after IPC dispatch does not alter execution', async () => {
    const callerArgv = ['invoke', 'window.list', '--help']
    const promise = runViaIpc({ argv: callerArgv })

    // Caller attempts to tamper with the array in-place before or during execution
    callerArgv[1] = 'input.clickPoint'
    callerArgv[2] = '100'

    const result = await promise
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('window.list')
    expect(result.argv).toEqual(['invoke', 'window.list', '--help'])
  })

  it('handles concurrent interleaved IPC requests without cross-contamination or head-of-line blocking', async () => {
    const results = await Promise.allSettled([
      runViaIpc({ argv: ['invoke', 'input.clickPoint', '10', '20'] }),
      runViaIpc({ argv: ['invoke', 'window.list', '--help'] }),
      runViaIpc({ argv: ['invoke', 'input.typeText', 'concurrent text'] }),
      runViaIpc({ argv: ['invoke', 'display.capture', '--help'] }),
    ])

    expect(results[0].status).toBe('rejected')
    if (results[0].status === 'rejected') {
      expect((results[0].reason as Error).message).toContain("Mutating desktop operation 'input.clickPoint' is not authorized")
    }

    expect(results[1].status).toBe('fulfilled')
    if (results[1].status === 'fulfilled') {
      expect(results[1].value.exitCode).toBe(0)
      expect(results[1].value.output).toContain('window.list')
    }

    expect(results[2].status).toBe('rejected')
    if (results[2].status === 'rejected') {
      expect((results[2].reason as Error).message).toContain("Mutating desktop operation 'input.typeText' is not authorized")
    }

    expect(results[3].status).toBe('fulfilled')
    if (results[3].status === 'fulfilled') {
      expect(results[3].value.exitCode).toBe(0)
      expect(results[3].value.output).toContain('display.capture')
    }
  })

  it('preserves screenshot reading and lifecycle cleanup over IPC', async () => {
    // 1. Screenshot read
    const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6SAAAAABJRU5ErkJggg==', 'base64')
    const screenshotPath = join(storeRoot, 'shot.png')
    await writeFile(screenshotPath, imageBytes)

    const dataUrl = await readImageViaIpc({ path: screenshotPath })
    expect(dataUrl).toBe(`data:image/png;base64,${imageBytes.toString('base64')}`)

    // 2. Lifecycle cleanup via app quit
    await emitAppBeforeQuit()

    // Post-quit requests must be rejected cleanly
    await expect(runViaIpc({ argv: ['invoke', '--help'] })).rejects.toThrow('Computer use has stopped.')
  })
})
