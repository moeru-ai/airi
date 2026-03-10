import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runCapVite } from './index'

const { createServer, x } = vi.hoisted(() => ({
  createServer: vi.fn(),
  x: vi.fn(),
}))

vi.mock('tinyexec', () => ({
  x,
}))

vi.mock('vite', () => ({
  createServer,
}))

describe('runCapVite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('forwards cap args into cap run', async () => {
    const processOnce = vi.spyOn(process, 'once').mockImplementation(() => process)

    createServer.mockResolvedValue({
      close: vi.fn().mockResolvedValue(undefined),
      config: {
        logger: {
          info: vi.fn(),
        },
      },
      listen: vi.fn().mockResolvedValue(undefined),
      printUrls: vi.fn(),
      resolvedUrls: {
        local: ['http://127.0.0.1:5173/'],
      },
      watcher: {
        add: vi.fn(),
        off: vi.fn(),
        on: vi.fn(),
        unwatch: vi.fn().mockResolvedValue(undefined),
      },
    })

    x.mockReturnValue({
      kill: vi.fn(),
    })

    await runCapVite('android', 'emulator-5554', {
      capArgs: ['--flavor', 'release'],
    })

    expect(createServer).toHaveBeenCalledWith({
      clearScreen: false,
      root: process.cwd(),
    })

    expect(x).toHaveBeenCalledWith('cap', ['run', 'android', '--target', 'emulator-5554', '--flavor', 'release'], {
      nodeOptions: {
        cwd: process.cwd(),
        env: {
          CAPACITOR_DEV_SERVER_URL: 'http://127.0.0.1:5173/',
        },
        stdio: 'inherit',
      },
      persist: true,
      throwOnError: false,
    })

    expect(processOnce).toHaveBeenCalledWith('SIGINT', expect.any(Function))
    expect(processOnce).toHaveBeenCalledWith('SIGTERM', expect.any(Function))
  })
})
