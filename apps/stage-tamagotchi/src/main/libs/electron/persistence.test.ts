import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { number, object } from 'valibot'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * @example
 * describe('createConfig', () => {
 *   it('persists configuration data', async () => {
 *     // assertions
 *   })
 * })
 */
describe('createConfig', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  // https://github.com/moeru-ai/airi/commit/d2d5493136af4614798546c674d5707618429ca6
  //
  // ROOT CAUSE:
  //
  // If concurrent save calls share one temporary file path, one rename removes the file first.
  // A second rename attempt then fails with ENOENT and the save path logs an error.
  //
  // We fixed this by asserting each save operation writes and renames a distinct temp file path.
  it('uses a unique temp file per save to avoid concurrent rename collisions', async () => {
    const appMock = {
      getPath: vi.fn(() => join(tmpdir(), 'airi-user-data')),
    }
    const mkdirMock = vi.fn(async () => {})
    const existingTempFiles = new Set<string>()
    const renameMock = vi.fn(async (from: string) => {
      if (!existingTempFiles.has(from)) {
        const error = new Error(`ENOENT: no such file or directory, rename '${from}'`) as NodeJS.ErrnoException
        error.code = 'ENOENT'
        throw error
      }
      existingTempFiles.delete(from)
    })
    const writeCoordinator = {
      calls: 0,
      waitFor: Promise.resolve(),
      release: () => {},
    }
    const writeFileMock = vi.fn(async (path: string) => {
      existingTempFiles.add(path)
      writeCoordinator.calls += 1
      if (writeCoordinator.calls === 2) {
        writeCoordinator.release()
      }
      await writeCoordinator.waitFor
    })

    writeCoordinator.waitFor = new Promise<void>((resolve) => {
      writeCoordinator.release = resolve
    })

    vi.doMock('electron', () => ({
      app: appMock,
    }))
    vi.doMock('es-toolkit', () => ({
      throttle: (handler: (...args: unknown[]) => unknown) => handler,
    }))
    vi.doMock('node:fs', () => ({
      existsSync: () => false,
      readFileSync: () => '',
    }))
    vi.doMock('node:fs/promises', () => ({
      copyFile: vi.fn(async () => {}),
      mkdir: mkdirMock,
      rename: renameMock,
      writeFile: writeFileMock,
    }))

    const { createConfig } = await import('./persistence')
    const schema = object({ value: number() })
    const config = createConfig('windows-widgets', 'config.json', schema, { default: { value: 0 } })
    const saveErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    config.setup()
    config.update({ value: 1 })
    config.update({ value: 2 })

    /**
     * @example
     * expect(renameMock).toHaveBeenCalledTimes(2)
     * expect(saveErrorSpy).not.toHaveBeenCalledWith('Failed to save config', expect.anything())
     * expect(new Set(renameMock.mock.calls.map(([from]) => from)).size).toBe(2)
     */
    await vi.waitFor(() => {
      expect(renameMock).toHaveBeenCalledTimes(2)
    })

    expect(saveErrorSpy).not.toHaveBeenCalledWith('Failed to save config', expect.anything())
    expect(new Set(renameMock.mock.calls.map(([from]) => from)).size).toBe(2)
    saveErrorSpy.mockRestore()
  })

  // https://github.com/moeru-ai/airi/actions/runs/38099469838/job/114352217426

  // ROOT CAUSE:
  //
  // `save` is throttled and `update` does not await it, and it read
  // `app.getPath('userData')` while it ran. A write that a case scheduled
  // therefore landed in the root the next case had already created.
  //
  // It now reaches the root its own config read from.
  it('writes a deferred save to the root its own config read from', async () => {
    const files = new Map<string, string>()
    const rootA = join(tmpdir(), 'airi-user-data-a')
    const rootB = join(tmpdir(), 'airi-user-data-b')
    const fileOf = (root: string) => join(root, 'app-options.json')
    const appMock = { getPath: vi.fn(() => rootA) }
    let runPendingSave: (() => unknown) | undefined

    vi.doMock('electron', () => ({
      app: appMock,
    }))
    // Hold the throttled write, so the test can run it after the root moved.
    vi.doMock('es-toolkit', () => ({
      throttle: (handler: () => unknown) => () => {
        runPendingSave = handler
      },
    }))
    vi.doMock('node:fs', () => ({
      existsSync: (path: string) => files.has(path),
      readFileSync: (path: string) => files.get(path),
    }))
    vi.doMock('node:fs/promises', () => ({
      copyFile: vi.fn(async () => {}),
      mkdir: vi.fn(async () => {}),
      rename: vi.fn(async (from: string, to: string) => {
        files.set(to, files.get(from) ?? '')
        files.delete(from)
      }),
      writeFile: vi.fn(async (path: string, body: string) => {
        files.set(path, body)
      }),
    }))

    const { createConfig } = await import('./persistence')
    const schema = object({ value: number() })

    const first = createConfig('app', 'options.json', schema, { default: { value: 0 } })
    first.setup()
    first.update({ value: 7 })
    const deferredSave = runPendingSave
    if (!deferredSave) {
      throw new Error('Expected the throttled write.')
    }

    // The root moves before that write runs, the way each case of the extension
    // host suite receives its own directory.
    appMock.getPath.mockReturnValue(rootB)
    await deferredSave()

    // The write reached the root its config read from, and the other root holds
    // no file at all.
    expect(files.get(fileOf(rootA))).toBe(JSON.stringify({ value: 7 }))
    expect(files.has(fileOf(rootB))).toBe(false)

    const second = createConfig('app', 'options.json', schema, { default: { value: 0 } })
    second.setup()

    expect(second.get()).toEqual({ value: 0 })
    expect(first.get()).toEqual({ value: 7 })
  })
})
