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
   *
   * NOTICE: writes for the same config are now also serialized (see enqueueWrite(), added for
   * PR #2512 discussion r4180458802), so two saves can no longer be in flight at the same
   * instant -- this test no longer needs to force that overlap to prove each save still gets
   * its own temp file; it just has to prove two sequential saves don't start sharing state.
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
    const writeFileMock = vi.fn(async (path: string) => {
      existingTempFiles.add(path)
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

    await vi.waitFor(() => {
      expect(renameMock).toHaveBeenCalledTimes(2)
    })

    expect(saveErrorSpy).not.toHaveBeenCalledWith('Failed to save config', expect.anything())
    expect(new Set(renameMock.mock.calls.map(([from]) => from)).size).toBe(2)
    saveErrorSpy.mockRestore()
  })

  // ROOT CAUSE:
  //
  // update() sets the in-memory map and calls save() without awaiting it, and save() is
  // throttled and swallows write errors into console.error instead of rejecting. A caller
  // that needs to know a write actually landed on disk before taking an irreversible
  // follow-up action (e.g. deleting the only other copy of a value elsewhere) had no way to
  // wait for, or detect the failure of, the real write. (flush() -- added separately for
  // shutdown-ordering purposes -- doesn't help here either: it awaits already-scheduled
  // writes, but those still swallow their own errors, so Promise.all(pendingWrites) never
  // rejects.)
  //
  // https://github.com/moeru-ai/airi/pull/2512#discussion_r4179494683
  //
  // We fixed this by adding writeDurable(), which performs its own immediate (unthrottled)
  // write of the current state and returns a promise that resolves only once the
  // write+rename completed, or rejects with the real error.
  it('writeDurable() resolves only after the write and rename actually complete', async () => {
    const appMock = { getPath: vi.fn(() => '/tmp/airi-user-data') }
    let resolveWrite: (() => void) | undefined
    const writeFileMock = vi.fn(() => new Promise<void>((resolve) => {
      resolveWrite = resolve
    }))
    const renameMock = vi.fn(async () => {})

    vi.doMock('electron', () => ({ app: appMock }))
    vi.doMock('es-toolkit', () => ({
      throttle: (handler: (...args: unknown[]) => unknown) => handler,
    }))
    vi.doMock('node:fs', () => ({ existsSync: () => false, readFileSync: () => '' }))
    vi.doMock('node:fs/promises', () => ({
      copyFile: vi.fn(async () => {}),
      mkdir: vi.fn(async () => {}),
      rename: renameMock,
      writeFile: writeFileMock,
    }))

    const { createConfig } = await import('./persistence')
    const schema = object({ value: number() })
    // NOTICE: setup() with a "missing" config file just sets persistenceMap synchronously
    // (no save() call) -- deliberately not calling update() here too, so the only write in
    // flight is the one writeDurable() itself triggers below (update()'s own throttled
    // save() would otherwise race writeFileMock's single resolver against writeDurable()'s).
    const config = createConfig('windows-widgets', 'write-durable-config.json', schema, { default: { value: 0 } })
    config.setup()

    let writeDurableResolved = false
    const writeDurablePromise = config.writeDurable().then(() => {
      writeDurableResolved = true
    })

    await vi.waitFor(() => {
      expect(writeFileMock).toHaveBeenCalled()
    })
    expect(writeDurableResolved).toBe(false)
    expect(renameMock).not.toHaveBeenCalled()

    resolveWrite?.()
    await writeDurablePromise

    expect(writeDurableResolved).toBe(true)
    expect(renameMock).toHaveBeenCalledTimes(1)
  })

  it('writeDurable() rejects when the write fails, instead of only logging it', async () => {
    const appMock = { getPath: vi.fn(() => '/tmp/airi-user-data') }
    const writeError = new Error('ENOSPC: no space left on device')

    vi.doMock('electron', () => ({ app: appMock }))
    vi.doMock('es-toolkit', () => ({
      throttle: (handler: (...args: unknown[]) => unknown) => handler,
    }))
    vi.doMock('node:fs', () => ({ existsSync: () => false, readFileSync: () => '' }))
    vi.doMock('node:fs/promises', () => ({
      copyFile: vi.fn(async () => {}),
      mkdir: vi.fn(async () => {}),
      rename: vi.fn(async () => {}),
      writeFile: vi.fn(async () => {
        throw writeError
      }),
    }))

    const { createConfig } = await import('./persistence')
    const schema = object({ value: number() })
    const config = createConfig('windows-widgets', 'write-durable-failure-config.json', schema, { default: { value: 0 } })
    config.setup()

    await expect(config.writeDurable()).rejects.toThrow(writeError)
  })

  // ROOT CAUSE:
  //
  // writeDurable() tracks its write in the same pendingWrites set flush() awaits, so flush()
  // (called elsewhere for shutdown ordering) waits for an in-flight durable write instead of
  // racing past it. Tracking the real (rejecting) promise directly caused two problems: an
  // unhandled rejection on trackWrite()'s own internal cleanup chain, and flush() itself
  // adopting the failure -- breaking its documented "never rejects" contract that other
  // callers rely on.
  //
  // We fixed this by tracking a non-rejecting shadow (write.catch(() => {})) instead, so
  // flush() still waits for the write to settle but never adopts its failure.
  it('flush() still waits for a failing writeDurable(), but does not reject because of it', async () => {
    const appMock = { getPath: vi.fn(() => '/tmp/airi-user-data') }
    const writeError = new Error('ENOSPC: no space left on device')

    vi.doMock('electron', () => ({ app: appMock }))
    vi.doMock('es-toolkit', () => ({
      throttle: (handler: (...args: unknown[]) => unknown) => {
        const throttled = (...args: unknown[]) => handler(...args)
        throttled.flush = () => {}
        return throttled
      },
    }))
    vi.doMock('node:fs', () => ({ existsSync: () => false, readFileSync: () => '' }))
    vi.doMock('node:fs/promises', () => ({
      copyFile: vi.fn(async () => {}),
      mkdir: vi.fn(async () => {}),
      rename: vi.fn(async () => {}),
      writeFile: vi.fn(async () => {
        throw writeError
      }),
    }))

    const { createConfig } = await import('./persistence')
    const schema = object({ value: number() })
    const config = createConfig('windows-widgets', 'flush-durable-interaction-config.json', schema, { default: { value: 0 } })
    config.setup()

    const writeDurablePromise = config.writeDurable()
    await expect(config.flush()).resolves.toBeUndefined()
    await expect(writeDurablePromise).rejects.toThrow(writeError)
  })

  // ROOT CAUSE:
  //
  // writeDurable() and the throttled save() each independently ran their own
  // read-current-state -> write-tmp -> rename-to-final sequence with no ordering between
  // them. Reproduction: park a slow save for value=1, update to value=2, await writeDurable()
  // (which wrote/resolved with value=2), then let the parked save finish -- its rename
  // overwrote disk back to value=1, *after* the durable write had already "confirmed"
  // success. The durable acknowledgement was worthless without serialization.
  //
  // https://github.com/moeru-ai/airi/pull/2512#discussion_r4180458802
  //
  // We fixed this by routing every write (throttled save and writeDurable alike) through
  // enqueueWrite(), so a later write can never start until an earlier one has fully settled.
  it('serializes a durable write behind an in-flight throttled save, so neither can roll back the other', async () => {
    const appMock = { getPath: vi.fn(() => '/tmp/airi-user-data') }
    const pendingWrites: { data: string, resolve: () => void }[] = []
    const writeFileMock = vi.fn((_path: string, data: string) => new Promise<void>((resolve) => {
      pendingWrites.push({ data, resolve })
    }))
    const renameMock = vi.fn(async () => {})

    vi.doMock('electron', () => ({ app: appMock }))
    vi.doMock('es-toolkit', () => ({
      throttle: (handler: (...args: unknown[]) => unknown) => handler,
    }))
    vi.doMock('node:fs', () => ({ existsSync: () => false, readFileSync: () => '' }))
    vi.doMock('node:fs/promises', () => ({
      copyFile: vi.fn(async () => {}),
      mkdir: vi.fn(async () => {}),
      rename: renameMock,
      writeFile: writeFileMock,
    }))

    const { createConfig } = await import('./persistence')
    const schema = object({ value: number() })
    const config = createConfig('windows-widgets', 'serialize-config.json', schema, { default: { value: 0 } })
    config.setup()

    config.update({ value: 1 })
    await vi.waitFor(() => {
      expect(writeFileMock).toHaveBeenCalledTimes(1)
    })

    config.update({ value: 2 })
    const writeDurablePromise = config.writeDurable()

    // Neither the second save (from update({value:2})) nor writeDurable() may have started
    // yet -- both must wait for the still-pending first write to settle.
    expect(writeFileMock).toHaveBeenCalledTimes(1)

    // Let the first (now-stale) write settle. Without serialization, this is exactly the
    // moment a second, fresher write that finished first could get rolled back by this one
    // finishing "late" -- the review's reproduction.
    pendingWrites[0].resolve()

    await vi.waitFor(() => {
      expect(pendingWrites.length).toBeGreaterThanOrEqual(2)
    })
    const secondWrite = JSON.parse(pendingWrites[1].data) as { value: number }
    expect(secondWrite.value).toBe(2)

    // Let that second write (whichever of update(2)'s save / writeDurable() actually claimed
    // the second turn) settle, then the third must appear -- resolve each in turn so none are
    // left dangling (both update(2)'s save and writeDurable() enqueued their own write).
    pendingWrites[1].resolve()
    await vi.waitFor(() => {
      expect(pendingWrites.length).toBeGreaterThanOrEqual(3)
    })
    const thirdWrite = JSON.parse(pendingWrites[2].data) as { value: number }
    expect(thirdWrite.value).toBe(2)
    pendingWrites[2].resolve()

    await writeDurablePromise

    await vi.waitFor(() => {
      expect(renameMock).toHaveBeenCalledTimes(3)
    })
  })
})
