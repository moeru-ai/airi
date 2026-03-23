import type { Plugin } from 'vite'

import process from 'node:process'

import { EventEmitter } from 'node:events'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
      root: '/repo/app',
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

function configurePluginServer(plugin: Plugin, server: ReturnType<typeof createMockServer>) {
  const configureServer = plugin.configureServer
  if (!configureServer) {
    throw new Error('cap-vite plugin is missing configureServer().')
  }

  const handler = typeof configureServer === 'function'
    ? configureServer
    : configureServer.handler

  handler.call({} as any, server as any)
}

const originalStdin = Object.getOwnPropertyDescriptor(process, 'stdin')

describe('capVitePlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  afterEach(() => {
    if (originalStdin) {
      Object.defineProperty(process, 'stdin', originalStdin)
    }
  })

  it('restarts cap run when the terminal shortcut receives r', async () => {
    const firstRun = createMockResult()
    const secondRun = createMockResult()
    x.mockReturnValueOnce(firstRun).mockReturnValueOnce(secondRun)

    const stdin = createMockStdin()
    Object.defineProperty(process, 'stdin', {
      configurable: true,
      value: stdin,
    })

    const { capVitePlugin } = await import('./vite-plugin')
    const server = createMockServer()

    configurePluginServer(capVitePlugin({
      capArgs: ['ios', '--scheme', 'AIRI'],
    }), server)

    server.httpServer.emit('listening')

    expect(emitKeypressEvents).toHaveBeenCalledWith(stdin)
    expect(stdin.setRawMode).toHaveBeenCalledWith(true)
    expect(x).toHaveBeenNthCalledWith(1, 'cap', ['run', 'ios', '--scheme', 'AIRI'], {
      nodeOptions: {
        cwd: '/repo/app',
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
      expect(server.config.logger.info).toHaveBeenCalledWith('[cap-vite] manual restart requested. Re-running cap run ios.')
      expect(x).toHaveBeenNthCalledWith(2, 'cap', ['run', 'ios', '--scheme', 'AIRI'], {
        nodeOptions: {
          cwd: '/repo/app',
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
    Object.defineProperty(process, 'stdin', {
      configurable: true,
      value: stdin,
    })

    const kill = vi.spyOn(process, 'kill').mockReturnValue(true)
    const { capVitePlugin } = await import('./vite-plugin')
    const server = createMockServer()

    configurePluginServer(capVitePlugin({
      capArgs: ['android'],
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
