import { EventEmitter } from 'node:events'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { announceDebuggerEndpoint } from './debugger'

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

describe('announceDebuggerEndpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.APP_REMOTE_DEBUG = 'true'
    process.env.APP_REMOTE_DEBUG_PORT = '9250'
  })

  afterEach(() => {
    delete process.env.APP_REMOTE_DEBUG
    delete process.env.APP_REMOTE_DEBUG_PORT
  })

  it('does not open the remote inspector in the system browser', () => {
    const response = new EventEmitter()
    const request = new EventEmitter()

    httpMocks.get.mockImplementation((_url, handleResponse) => {
      handleResponse(response)
      return request
    })

    announceDebuggerEndpoint()

    response.emit('data', JSON.stringify([{
      webSocketDebuggerUrl: 'ws://localhost:9250/devtools/page/renderer',
    }]))
    response.emit('end')

    // ROOT CAUSE:
    //
    // Enabling the CDP endpoint also called shell.openExternal, so every
    // development launch forced the inspector into the system browser.
    //
    // Remote inspection should remain available through the logged URL
    // without taking focus away from the Electron app.
    expect(electronMocks.openExternal).not.toHaveBeenCalled()
  })
})
