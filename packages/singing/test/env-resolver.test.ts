import process from 'node:process'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const existsSyncMock = vi.hoisted(() => vi.fn())
const spawnSyncMock = vi.hoisted(() => vi.fn())

vi.mock('node:fs', () => ({
  existsSync: existsSyncMock,
}))

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    spawnSync: spawnSyncMock,
  }
})

describe('resolveRuntimeEnv', () => {
  beforeEach(() => {
    vi.resetModules()
    existsSyncMock.mockReset()
    spawnSyncMock.mockReset()
    delete process.env.AIRI_SINGING_PYTHON_PATH
  })

  afterEach(() => {
    delete process.env.AIRI_SINGING_PYTHON_PATH
  })

  it('prefers python3 when the local venv is absent on POSIX hosts', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
    existsSyncMock.mockReturnValue(false)
    spawnSyncMock.mockImplementation((command: string) => ({
      error: command === 'python3' ? undefined : new Error('ENOENT'),
      status: command === 'python3' ? 0 : null,
    }))

    const { resolveRuntimeEnv } = await import('../src/adapters/runtime/env-resolver')
    const env = resolveRuntimeEnv()

    expect(env.pythonPath).toBe('python3')
    expect(spawnSyncMock).toHaveBeenNthCalledWith(1, 'python3', ['--version'], expect.any(Object))
  })

  it('falls back to python when python3 is unavailable but python exists', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
    existsSyncMock.mockReturnValue(false)
    spawnSyncMock.mockImplementation((command: string) => ({
      error: command === 'python' ? undefined : new Error('ENOENT'),
      status: command === 'python' ? 0 : null,
    }))

    const { resolveRuntimeEnv } = await import('../src/adapters/runtime/env-resolver')
    const env = resolveRuntimeEnv()

    expect(env.pythonPath).toBe('python')
    expect(spawnSyncMock).toHaveBeenNthCalledWith(1, 'python3', ['--version'], expect.any(Object))
    expect(spawnSyncMock).toHaveBeenNthCalledWith(2, 'python', ['--version'], expect.any(Object))
  })
})
