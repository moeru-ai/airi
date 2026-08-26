import type { WidgetWindowSize } from '../../../shared/eventa'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { normalizeWidgetWindowSize } from '../../../shared/utils/electron/windows/window-size'
import { createWidgetIframeRequestCoordinator } from './iframe-request-coordinator'

describe('normalizeWidgetWindowSize', () => {
  it('returns undefined for missing or unusable base sizes', () => {
    expect(normalizeWidgetWindowSize()).toBeUndefined()
    expect(normalizeWidgetWindowSize({ height: 320, width: 0 })).toBeUndefined()
    expect(normalizeWidgetWindowSize({ height: -1, width: 320 })).toBeUndefined()
    expect(normalizeWidgetWindowSize({ height: 320, width: Number.NaN })).toBeUndefined()
    expect(normalizeWidgetWindowSize({ height: Number.POSITIVE_INFINITY, width: 320 })).toBeUndefined()
  })

  it('floors valid dimensions and strips invalid optional constraints', () => {
    const input: WidgetWindowSize = {
      height: 480.4,
      maxHeight: 720.1,
      maxWidth: 1280.6,
      minHeight: Number.NaN,
      minWidth: -10,
      width: 620.9,
    }

    expect(normalizeWidgetWindowSize(input)).toEqual({
      height: 480,
      maxHeight: 720,
      maxWidth: 1280,
      width: 620,
    })
  })

  it('keeps contradictory but numerically valid constraints for later display clamping', () => {
    const input: WidgetWindowSize = {
      height: 700,
      maxHeight: 600,
      maxWidth: 800,
      minHeight: 900,
      minWidth: 1200,
      width: 900,
    }

    expect(normalizeWidgetWindowSize(input)).toEqual({
      height: 700,
      maxHeight: 600,
      maxWidth: 800,
      minHeight: 900,
      minWidth: 1200,
      width: 900,
    })
  })
})

describe('createWidgetIframeRequestCoordinator', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('rejects immediately when the target widget is not open', async () => {
    const emitRequest = vi.fn()
    const coordinator = createWidgetIframeRequestCoordinator({
      emitRequest,
      hasRelay: () => true,
      hasWidget: () => false,
    })

    await expect(coordinator.requestWidgetIframe('kit-module:board', { action: 'snapshot' })).rejects.toThrow('Gamelet `kit-module:board` is not open.')
    expect(emitRequest).not.toHaveBeenCalled()
  })

  it('emits a correlated iframe request and resolves only the matching successful result', async () => {
    const emitRequest = vi.fn()
    const coordinator = createWidgetIframeRequestCoordinator({
      emitRequest,
      hasRelay: () => true,
      hasWidget: id => id === 'kit-module:board',
    })

    const request = coordinator.requestWidgetIframe('kit-module:board', { action: 'snapshot' })
    const emitted = emitRequest.mock.calls[0]?.[0]

    expect(emitted).toEqual({
      id: 'kit-module:board',
      payload: { action: 'snapshot' },
      requestId: expect.any(String),
      timeoutMs: 30000,
    })

    coordinator.publishWidgetIframeRequestResult({
      id: 'kit-module:other-board',
      ok: true,
      requestId: emitted.requestId,
      result: { fen: 'wrong-board' },
    })
    coordinator.publishWidgetIframeRequestResult({
      id: 'kit-module:board',
      ok: true,
      requestId: 'unknown-request',
      result: { fen: 'unknown-request' },
    })
    coordinator.publishWidgetIframeRequestResult({
      id: 'kit-module:board',
      ok: true,
      requestId: emitted.requestId,
      result: { fen: 'fen-after-request' },
    })

    await expect(request).resolves.toEqual({ fen: 'fen-after-request' })
  })

  it('rejects a matching failed iframe result', async () => {
    const emitRequest = vi.fn()
    const coordinator = createWidgetIframeRequestCoordinator({
      emitRequest,
      hasRelay: () => true,
      hasWidget: () => true,
    })

    const request = coordinator.requestWidgetIframe('kit-module:board', { action: 'snapshot' })
    const emitted = emitRequest.mock.calls[0]?.[0]
    coordinator.publishWidgetIframeRequestResult({
      error: 'Board rejected the snapshot request.',
      id: 'kit-module:board',
      ok: false,
      requestId: emitted.requestId,
    })

    await expect(request).rejects.toThrow('Board rejected the snapshot request.')
  })

  it('rejects timed out requests and removes their pending state', async () => {
    vi.useFakeTimers()
    const emitRequest = vi.fn()
    const coordinator = createWidgetIframeRequestCoordinator({
      emitRequest,
      hasRelay: () => true,
      hasWidget: () => true,
    })

    const request = coordinator.requestWidgetIframe('kit-module:board', { action: 'snapshot' }, { timeoutMs: 50 })
    const emitted = emitRequest.mock.calls[0]?.[0]
    const rejection = expect(request).rejects.toThrow('Gamelet request timed out after 50ms.')
    await vi.advanceTimersByTimeAsync(50)
    await rejection

    coordinator.publishWidgetIframeRequestResult({
      id: 'kit-module:board',
      ok: true,
      requestId: emitted.requestId,
      result: { fen: 'late-result' },
    })

    await expect(request).rejects.toThrow('Gamelet request timed out after 50ms.')
  })

  it('rejects pending requests for a removed widget', async () => {
    const emitRequest = vi.fn()
    const coordinator = createWidgetIframeRequestCoordinator({
      emitRequest,
      hasRelay: () => true,
      hasWidget: () => true,
    })

    const request = coordinator.requestWidgetIframe('kit-module:board', { action: 'snapshot' }, { timeoutMs: 30000 })
    const rejection = expect(request).rejects.toThrow('Gamelet was closed before the request completed.')
    coordinator.rejectPendingWidgetIframeRequests('kit-module:board')

    await rejection
  })

  it('rejects immediately when no renderer relay is available', async () => {
    const emitRequest = vi.fn()
    const coordinator = createWidgetIframeRequestCoordinator({
      emitRequest,
      hasRelay: () => false,
      hasWidget: () => true,
    })

    await expect(coordinator.requestWidgetIframe('kit-module:board', { action: 'snapshot' })).rejects.toThrow('Gamelet iframe relay is not available.')
    expect(emitRequest).not.toHaveBeenCalled()
  })

  it('rejects all pending requests when the widgets window closes', async () => {
    const emitRequest = vi.fn()
    const coordinator = createWidgetIframeRequestCoordinator({
      emitRequest,
      hasRelay: () => true,
      hasWidget: () => true,
    })

    const firstRequest = coordinator.requestWidgetIframe('kit-module:board', { action: 'snapshot' }, { timeoutMs: 30000 })
    const secondRequest = coordinator.requestWidgetIframe('kit-module:clock', { action: 'snapshot' }, { timeoutMs: 30000 })

    const firstRejection = expect(firstRequest).rejects.toThrow('Gamelet was closed before the request completed.')
    const secondRejection = expect(secondRequest).rejects.toThrow('Gamelet was closed before the request completed.')
    coordinator.rejectAllPendingWidgetIframeRequests()

    await firstRejection
    await secondRejection
  })
})
