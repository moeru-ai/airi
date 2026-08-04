import { EventEmitter } from 'node:events'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { openDebugger } from './debugger'

const electronMocks = vi.hoisted(() => ({
  appendSwitch: vi.fn(),
  openExternal: vi.fn(),
}))

const httpMocks = vi.hoisted(() => ({
  get: vi.fn(),
}))

vi.mock('electron', () => ({
  app: {
    commandLine: {
      appendSwitch: electronMocks.appendSwitch,
    },
  },
  shell: {
    openExternal: electronMocks.openExternal,
  },
}))

vi.mock('node:http', () => ({
  default: {
    get: httpMocks.get,
  },
}))

describe('openDebugger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.APP_REMOTE_DEBUG = 'true'
    process.env.APP_REMOTE_DEBUG_PORT = '9250'
  })

  afterEach(() => {
    delete process.env.APP_REMOTE_DEBUG
    delete process.env.APP_REMOTE_DEBUG_PORT
    delete process.env.APP_REMOTE_DEBUG_NO_OPEN
  })

  function emitDebuggerTarget() {
    const response = new EventEmitter()
    const request = new EventEmitter()

    httpMocks.get.mockImplementation((_url, handleResponse) => {
      handleResponse(response)
      return request
    })

    openDebugger()

    response.emit('data', JSON.stringify([{
      webSocketDebuggerUrl: 'ws://localhost:9250/devtools/page/renderer',
    }]))
    response.emit('end')
  }

  it('opens the remote inspector unless the developer opts out', () => {
    emitDebuggerTarget()

    expect(electronMocks.openExternal).toHaveBeenCalledWith(
      'http://localhost:9250/devtools/inspector.html?ws=localhost:9250/devtools/page/renderer',
    )
  })

  it('does not open the remote inspector when APP_REMOTE_DEBUG_NO_OPEN is enabled', () => {
    process.env.APP_REMOTE_DEBUG_NO_OPEN = 'true'

    emitDebuggerTarget()

    // ROOT CAUSE:
    //
    // The existing opt-out flag was only set by automation; the application
    // never read it, so every development launch still opened the browser.
    //
    // Reading the flag keeps CDP available and logged while leaving the
    // developer's browser alone.
    expect(electronMocks.openExternal).not.toHaveBeenCalled()
  })
})
