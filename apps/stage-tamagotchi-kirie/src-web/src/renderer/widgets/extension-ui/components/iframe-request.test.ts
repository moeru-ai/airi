import { createContext, defineInvokeHandler } from '@moeru/eventa'
import { gameletIframeRequest } from '@proj-airi/plugin-sdk-tamagotchi/gamelet'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createExtensionUiIframeRequestHandler,
  createExtensionUiIframeRequestQueueProcessor,
} from './iframe-request'

describe('createExtensionUiIframeRequestHandler', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('invokes the mounted iframe context and returns the gamelet response', async () => {
    const iframeContext = createContext()
    defineInvokeHandler(iframeContext, gameletIframeRequest, ({ payload }) => ({
      fen: `fen:${payload.action}`,
    }))

    const requestWidgetIframe = createExtensionUiIframeRequestHandler({
      getContext: () => iframeContext,
    })

    await expect(requestWidgetIframe({
      id: 'kit-module:board',
      requestId: 'req-1',
      payload: { action: 'snapshot' },
      timeoutMs: 1000,
    })).resolves.toEqual({
      fen: 'fen:snapshot',
    })
  })

  it('rejects when the iframe context is not ready', async () => {
    const requestWidgetIframe = createExtensionUiIframeRequestHandler({
      getContext: () => undefined,
    })

    await expect(requestWidgetIframe({
      id: 'kit-module:board',
      requestId: 'req-1',
      payload: { action: 'snapshot' },
      timeoutMs: 1000,
    })).rejects.toThrow('Gamelet `kit-module:board` iframe context is not ready.')
  })

  it('aborts the iframe invoke when the request timeout elapses', async () => {
    vi.useFakeTimers()
    const iframeContext = createContext()
    defineInvokeHandler(iframeContext, gameletIframeRequest, async () => {
      await new Promise(() => {})
      return {}
    })

    const requestWidgetIframe = createExtensionUiIframeRequestHandler({
      getContext: () => iframeContext,
    })

    const request = requestWidgetIframe({
      id: 'kit-module:board',
      requestId: 'req-1',
      payload: { action: 'snapshot' },
      timeoutMs: 5,
    })

    await vi.advanceTimersByTimeAsync(5)

    await expect(request).rejects.toThrow()
  })
})

describe('createExtensionUiIframeRequestQueueProcessor', () => {
  it('keeps iframe requests pending until the iframe ready handshake arrives', async () => {
    let iframeReady = false
    const emitResult = vi.fn()
    const requestWidgetIframe = vi.fn(async request => ({
      fen: `fen:${request.requestId}`,
    }))
    const input = {
      shouldHandle: (request: { id: string }) => request.id === 'kit-module:board',
      isReady: () => iframeReady,
      requestWidgetIframe,
      emitResult,
    }
    const processIframeRequests = createExtensionUiIframeRequestQueueProcessor(input)

    const requests = [{
      id: 'kit-module:board',
      requestId: 'req-1',
      payload: { action: 'start' },
      timeoutMs: 1000,
    }]

    processIframeRequests(requests)
    await Promise.resolve()

    expect(requestWidgetIframe).not.toHaveBeenCalled()
    expect(emitResult).not.toHaveBeenCalled()

    iframeReady = true
    processIframeRequests(requests)
    await Promise.resolve()

    expect(requestWidgetIframe).toHaveBeenCalledOnce()
    expect(emitResult).toHaveBeenCalledWith({
      id: 'kit-module:board',
      requestId: 'req-1',
      ok: true,
      result: { fen: 'fen:req-1' },
    })
  })

  it('emits results for every queued request delivered in one Vue update', async () => {
    const emitResult = vi.fn()
    const processIframeRequests = createExtensionUiIframeRequestQueueProcessor({
      shouldHandle: request => request.id === 'kit-module:board',
      requestWidgetIframe: async request => ({
        fen: `fen:${request.requestId}`,
      }),
      emitResult,
    })

    processIframeRequests([
      {
        id: 'kit-module:board',
        requestId: 'req-1',
        payload: { action: 'snapshot' },
        timeoutMs: 1000,
      },
      {
        id: 'kit-module:board',
        requestId: 'req-2',
        payload: { action: 'snapshot' },
        timeoutMs: 1000,
      },
    ])
    await Promise.resolve()

    expect(emitResult).toHaveBeenCalledWith({
      id: 'kit-module:board',
      requestId: 'req-1',
      ok: true,
      result: { fen: 'fen:req-1' },
    })
    expect(emitResult).toHaveBeenCalledWith({
      id: 'kit-module:board',
      requestId: 'req-2',
      ok: true,
      result: { fen: 'fen:req-2' },
    })
  })

  it('does not process the same request id twice', async () => {
    const emitResult = vi.fn()
    const requestWidgetIframe = vi.fn(async () => ({ fen: 'fen-once' }))
    const processIframeRequests = createExtensionUiIframeRequestQueueProcessor({
      shouldHandle: () => true,
      requestWidgetIframe,
      emitResult,
    })

    const requests = [{
      id: 'kit-module:board',
      requestId: 'req-1',
      payload: { action: 'snapshot' },
      timeoutMs: 1000,
    }]
    processIframeRequests(requests)
    processIframeRequests(requests)
    await Promise.resolve()

    expect(requestWidgetIframe).toHaveBeenCalledOnce()
    expect(emitResult).toHaveBeenCalledOnce()
  })
})
