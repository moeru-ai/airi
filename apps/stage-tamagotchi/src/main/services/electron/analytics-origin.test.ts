import type { BeforeSendResponse, OnBeforeSendHeadersListenerDetails, WebRequest, WebRequestFilter } from 'electron'

import { describe, expect, it, vi } from 'vitest'

import { setupAnalyticsRequestOrigin } from './analytics-origin'

type BeforeSendHeadersListener = (details: OnBeforeSendHeadersListenerDetails, callback: (response: BeforeSendResponse) => void) => void

function setup() {
  let registered: unknown[] = []
  const webRequest: Pick<WebRequest, 'onBeforeSendHeaders'> = {
    onBeforeSendHeaders(...args: unknown[]) {
      registered = args
    },
  }
  setupAnalyticsRequestOrigin({ webRequest })

  const [filter, listener] = registered as [WebRequestFilter, BeforeSendHeadersListener]
  function send(requestHeaders: Record<string, string>) {
    const callback = vi.fn<(response: BeforeSendResponse) => void>()
    listener({ requestHeaders } as OnBeforeSendHeadersListenerDetails, callback)
    return callback.mock.calls[0]?.[0].requestHeaders
  }

  return { filter, send }
}

describe('setupAnalyticsRequestOrigin', () => {
  // ROOT CAUSE:
  //
  // Electron sends no `Origin` header from the `file://` page of a packaged window.
  // OpenPanel answered 401, and the SDK dropped the event without an error.
  //
  // We fixed this by adding `Origin: null` in the main process.
  it('adds an origin to an OpenPanel request that has none', () => {
    const { filter, send } = setup()

    expect(filter.urls).toEqual(['https://analytics.airi.build/*'])
    expect(send({ 'Content-Type': 'application/json' })).toEqual({ 'Content-Type': 'application/json', 'Origin': 'null' })
  })

  it('keeps the origin that a development server page sends', () => {
    const { send } = setup()

    expect(send({ origin: 'http://localhost:5173' })).toEqual({ origin: 'http://localhost:5173' })
  })
})
