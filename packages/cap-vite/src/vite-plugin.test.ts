import type { Plugin, ViteDevServer } from 'vite'

import process from 'node:process'

import { EventEmitter } from 'node:events'
import { resolve } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const boundary = vi.hoisted(() => ({
  stdin: undefined as ReturnType<typeof createMockStdin> | undefined,
  kill: vi.fn(() => true),
}))

vi.mock('node:process', async (importOriginal) => {
  const original = await importOriginal<{ default: typeof process }>()
  return {
    ...original,
    default: {
      ...original.default,
      get stdin() { return boundary.stdin },
      kill: boundary.kill,
      once: vi.fn(),
      off: vi.fn(),
    },
  }
})

const { emitKeypressEvents, x } = vi.hoisted(() => ({
  emitKeypressEvents: vi.fn(),
  x: vi.fn(),
}))

vi.mock('node:readline', () => ({
  emitKeypressEvents,
}))

vi.mock('tinyexec', () => ({
  x,
}))

type MockResult = Promise<{ exitCode: number, stderr: string, stdout: string }> & {
  kill: ReturnType<typeof vi.fn>
}

class MockWatcher extends EventEmitter {
  add = vi.fn()
  unwatch = vi.fn(async () => {})
}

class MockHttpServer extends EventEmitter {}

function createMockResult(): MockResult {
  const output = {
    exitCode: 0,
    stderr: '',
    stdout: '',
  }

  return Object.assign(Promise.resolve(output), {
    kill: vi.fn(() => true),
  })
}

function createMockServer() {
  const watcher = new MockWatcher()
  const httpServer = new MockHttpServer()

  return {
    config: {
      logger: {
        error: vi.fn(),
        info: vi.fn(),
      },
      root: resolve(import.meta.dirname, 'testdata', 'app'),
    },
    httpServer,
    resolvedUrls: {
      local: ['http://127.0.0.1:5173/'],
    },
    watcher,
  }
}

function createMockStdin() {
  const stdin = new EventEmitter() as EventEmitter & {
    isRaw: boolean
    isTTY: boolean
    resume: ReturnType<typeof vi.fn>
    setEncoding: ReturnType<typeof vi.fn>
    setRawMode: ReturnType<typeof vi.fn>
  }

  stdin.isRaw = false
  stdin.isTTY = true
  stdin.resume = vi.fn()
  stdin.setEncoding = vi.fn()
  stdin.setRawMode = vi.fn((value: boolean) => {
    stdin.isRaw = value
  })

  return stdin
}

async function configurePluginServer(plugin: Plugin, server: ReturnType<typeof createMockServer>) {
  const configureServer = plugin.configureServer
  if (!configureServer) {
    throw new Error('cap-vite plugin is missing configureServer().')
  }

  const handler = typeof configureServer === 'function'
    ? configureServer
    : configureServer.handler

  await handler.call({} as ThisParameterType<typeof handler>, server as unknown as ViteDevServer)
}

describe('capVitePlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  afterEach(() => {
    boundary.stdin = undefined
  })

  it('restarts cap run when the terminal shortcut receives r', async () => {
    const firstRun = createMockResult()
    const secondRun = createMockResult()
    x.mockReturnValueOnce(firstRun).mockReturnValueOnce(secondRun)

    const stdin = createMockStdin()
    boundary.stdin = stdin

    const { capVitePlugin } = await import('./vite-plugin')
    const server = createMockServer()

    await configurePluginServer(capVitePlugin({
      capArgs: ['ios', '--target', 'iPhone 16 Pro', '--scheme', 'AIRI'],
    }), server)

    server.httpServer.emit('listening')

    expect(emitKeypressEvents).toHaveBeenCalledWith(stdin)
    expect(stdin.setRawMode).toHaveBeenCalledWith(true)
    expect(x).toHaveBeenNthCalledWith(1, 'cap', ['run', 'ios', '--target', 'iPhone 16 Pro', '--scheme', 'AIRI'], {
      nodeOptions: {
        cwd: resolve(import.meta.dirname, 'testdata', 'app'),
        env: {
          CAPACITOR_DEV_SERVER_URL: 'http://127.0.0.1:5173/',
        },
        stdio: ['ignore', 'inherit', 'inherit'],
      },
      throwOnError: false,
    })

    stdin.emit('keypress', 'r', { ctrl: false, name: 'r' })

    await vi.waitFor(() => {
      expect(firstRun.kill).toHaveBeenCalledWith('SIGINT')
      expect(server.config.logger.info).toHaveBeenCalledWith('[cap-vite] manual restart requested. Re-running "cap run ios --target iPhone 16 Pro --scheme AIRI".')
      expect(x).toHaveBeenNthCalledWith(2, 'cap', ['run', 'ios', '--target', 'iPhone 16 Pro', '--scheme', 'AIRI'], {
        nodeOptions: {
          cwd: resolve(import.meta.dirname, 'testdata', 'app'),
          env: {
            CAPACITOR_DEV_SERVER_URL: 'http://127.0.0.1:5173/',
          },
          stdio: ['ignore', 'inherit', 'inherit'],
        },
        throwOnError: false,
      })
    })

    server.httpServer.emit('close')

    await vi.waitFor(() => {
      expect(secondRun.kill).toHaveBeenCalledWith('SIGINT')
    })
  })

  it('restores terminal state before forwarding ctrl+c to vite', async () => {
    const run = createMockResult()
    x.mockReturnValue(run)

    const stdin = createMockStdin()
    boundary.stdin = stdin

    const kill = boundary.kill
    const { capVitePlugin } = await import('./vite-plugin')
    const server = createMockServer()

    await configurePluginServer(capVitePlugin({
      capArgs: ['android', '--target', 'emulator-5554'],
    }), server)

    server.httpServer.emit('listening')
    stdin.emit('keypress', '\u0003', { ctrl: true, name: 'c' })

    await vi.waitFor(() => {
      expect(run.kill).toHaveBeenCalledWith('SIGINT')
      expect(stdin.setRawMode).toHaveBeenNthCalledWith(1, true)
      expect(stdin.setRawMode).toHaveBeenNthCalledWith(2, false)
      expect(kill).toHaveBeenCalledWith(process.pid, 'SIGINT')
    })
  })
})
