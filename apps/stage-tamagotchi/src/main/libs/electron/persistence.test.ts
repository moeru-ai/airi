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

  /**
   * @example
   * it('uses a unique temp file per save to avoid concurrent rename collisions', async () => {
   *   await vi.waitFor(() => {
   *     expect(renameMock).toHaveBeenCalledTimes(2)
   *   })
   * })
   *
   * Failed to save config Error: ENOENT: no such file or directory, rename '/path/to/the/electron/app/data/app-config.json.tmp' -> '/path/to/the/electron/app/data/app-config.json'
   *   at async rename (node:internal/fs/promises:785:10)
   *   at async file://./airi/apps/stage-tamagotchi/out/main/index.js:3327:4 {
   *     errno: -2,
   *     code: 'ENOENT',
   *     syscall: 'rename',
   *     path: '/path/to/the/electron/app/data/app-config.json.tmp',
   *     dest: '/path/to/the/electron/app/data/app-config.json'
   *   }
   *
   * ROOT CAUSE:
   *
   * If concurrent save calls share one temporary file path, one rename removes the file first.
   * This causes a second rename attempt to fail with ENOENT, and the save path logs an error.
   *
   * We fixed this by asserting each save operation writes and renames a distinct temp file path.
   */
  it('uses a unique temp file per save to avoid concurrent rename collisions', async () => {
    const appMock = {
      getPath: vi.fn(() => '/tmp/airi-user-data'),
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
      throttle: (handler: (...args: unknown[]) => unknown) => Object.assign(handler, {
        cancel: vi.fn(),
        flush: vi.fn(),
      }),
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

  it('flushes the latest throttled config before the Electron main process exits', async () => {
    const writeFileMock = vi.fn(async () => {})
    const renameMock = vi.fn(async () => {})

    vi.doMock('electron', () => ({
      app: {
        getPath: vi.fn(() => '/tmp/airi-user-data'),
      },
    }))
    vi.doMock('es-toolkit', () => ({
      throttle: (handler: () => void) => {
        let pending = false
        return Object.assign(
          () => {
            pending = true
          },
          {
            cancel: vi.fn(),
            flush: () => {
              if (!pending)
                return
              pending = false
              handler()
            },
          },
        )
      },
    }))
    vi.doMock('node:fs', () => ({
      existsSync: () => false,
      readFileSync: () => '',
    }))
    vi.doMock('node:fs/promises', () => ({
      copyFile: vi.fn(async () => {}),
      mkdir: vi.fn(async () => {}),
      rename: renameMock,
      writeFile: writeFileMock,
    }))

    const { createConfig } = await import('./persistence')
    const config = createConfig('app', 'config.json', object({ value: number() }), {
      default: { value: 0 },
    })

    config.setup()
    config.update({ value: 42 })

    expect(writeFileMock).not.toHaveBeenCalled()

    // ROOT CAUSE:
    //
    // If Electron restarts while a throttled bounds update is pending, the
    // process exits before the async config write starts.
    //
    // Before the patch, createConfig exposed no lifecycle operation that could
    // force and await this pending save.
    //
    // We fixed this by cancelling the delayed call, awaiting active writes, and
    // persisting the latest in-memory value as the authoritative final write.
    await config.flush()

    expect(writeFileMock).toHaveBeenCalledOnce()
    expect(writeFileMock).toHaveBeenCalledWith(
      expect.stringMatching(/app-config\.json\..+\.tmp$/),
      JSON.stringify({ value: 42 }),
    )
    expect(renameMock).toHaveBeenCalledOnce()
  })
})
