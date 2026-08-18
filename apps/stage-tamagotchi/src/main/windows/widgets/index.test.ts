import type { WidgetWindowSize } from '../../../shared/eventa'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { normalizeWidgetWindowSize } from '../../../shared/utils/electron/windows/window-size'
import { createWidgetIframeRequestCoordinator } from './iframe-request-coordinator'

describe('normalizeWidgetWindowSize', () => {
  it('returns undefined for missing or unusable base sizes', () => {
    expect(normalizeWidgetWindowSize()).toBeUndefined()
    expect(normalizeWidgetWindowSize({ width: 0, height: 320 })).toBeUndefined()
    expect(normalizeWidgetWindowSize({ width: 320, height: -1 })).toBeUndefined()
    expect(normalizeWidgetWindowSize({ width: Number.NaN, height: 320 })).toBeUndefined()
    expect(normalizeWidgetWindowSize({ width: 320, height: Number.POSITIVE_INFINITY })).toBeUndefined()
  })

  it('floors valid dimensions and strips invalid optional constraints', () => {
    const input: WidgetWindowSize = {
      width: 620.9,
      height: 480.4,
      minWidth: -10,
      minHeight: Number.NaN,
      maxWidth: 1280.6,
      maxHeight: 720.1,
    }

    expect(normalizeWidgetWindowSize(input)).toEqual({
      width: 620,
      height: 480,
      maxWidth: 1280,
      maxHeight: 720,
    })
  })

  it('keeps contradictory but numerically valid constraints for later display clamping', () => {
    const input: WidgetWindowSize = {
      width: 900,
      height: 700,
      minWidth: 1200,
      maxWidth: 800,
      minHeight: 900,
      maxHeight: 600,
    }

    expect(normalizeWidgetWindowSize(input)).toEqual({
      width: 900,
      height: 700,
      minWidth: 1200,
      maxWidth: 800,
      minHeight: 900,
      maxHeight: 600,
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
      hasWidget: () => false,
      hasRelay: () => true,
    })

    await expect(coordinator.requestWidgetIframe('kit-module:board', { action: 'snapshot' })).rejects.toThrow('Gamelet `kit-module:board` is not open.')
    expect(emitRequest).not.toHaveBeenCalled()
  })

  it('emits a correlated iframe request and resolves only the matching successful result', async () => {
    const emitRequest = vi.fn()
    const coordinator = createWidgetIframeRequestCoordinator({
      emitRequest,
      hasWidget: id => id === 'kit-module:board',
      hasRelay: () => true,
    })

    const request = coordinator.requestWidgetIframe('kit-module:board', { action: 'snapshot' })
    const emitted = emitRequest.mock.calls[0]?.[0]

    expect(emitted).toEqual({
      id: 'kit-module:board',
      requestId: expect.any(String),
      payload: { action: 'snapshot' },
      timeoutMs: 30000,
    })

    coordinator.publishWidgetIframeRequestResult({
      id: 'kit-module:other-board',
      requestId: emitted.requestId,
      ok: true,
      result: { fen: 'wrong-board' },
    })
    coordinator.publishWidgetIframeRequestResult({
      id: 'kit-module:board',
      requestId: 'unknown-request',
      ok: true,
      result: { fen: 'unknown-request' },
    })
    coordinator.publishWidgetIframeRequestResult({
      id: 'kit-module:board',
      requestId: emitted.requestId,
      ok: true,
      result: { fen: 'fen-after-request' },
    })

    await expect(request).resolves.toEqual({ fen: 'fen-after-request' })
  })

  it('rejects a matching failed iframe result', async () => {
    const emitRequest = vi.fn()
    const coordinator = createWidgetIframeRequestCoordinator({
      emitRequest,
      hasWidget: () => true,
      hasRelay: () => true,
    })

    const request = coordinator.requestWidgetIframe('kit-module:board', { action: 'snapshot' })
    const emitted = emitRequest.mock.calls[0]?.[0]
    coordinator.publishWidgetIframeRequestResult({
      id: 'kit-module:board',
      requestId: emitted.requestId,
      ok: false,
      error: 'Board rejected the snapshot request.',
    })

    await expect(request).rejects.toThrow('Board rejected the snapshot request.')
  })

  it('rejects timed out requests and removes their pending state', async () => {
    vi.useFakeTimers()
    const emitRequest = vi.fn()
    const coordinator = createWidgetIframeRequestCoordinator({
      emitRequest,
      hasWidget: () => true,
      hasRelay: () => true,
    })

    const request = coordinator.requestWidgetIframe('kit-module:board', { action: 'snapshot' }, { timeoutMs: 50 })
    const emitted = emitRequest.mock.calls[0]?.[0]
    const rejection = expect(request).rejects.toThrow('Gamelet request timed out after 50ms.')
    await vi.advanceTimersByTimeAsync(50)
    await rejection

    coordinator.publishWidgetIframeRequestResult({
      id: 'kit-module:board',
      requestId: emitted.requestId,
      ok: true,
      result: { fen: 'late-result' },
    })

    await expect(request).rejects.toThrow('Gamelet request timed out after 50ms.')
  })

  it('rejects pending requests for a removed widget', async () => {
    const emitRequest = vi.fn()
    const coordinator = createWidgetIframeRequestCoordinator({
      emitRequest,
      hasWidget: () => true,
      hasRelay: () => true,
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
      hasWidget: () => true,
      hasRelay: () => false,
    })

    await expect(coordinator.requestWidgetIframe('kit-module:board', { action: 'snapshot' })).rejects.toThrow('Gamelet iframe relay is not available.')
    expect(emitRequest).not.toHaveBeenCalled()
  })

  it('rejects all pending requests when the widgets window closes', async () => {
    const emitRequest = vi.fn()
    const coordinator = createWidgetIframeRequestCoordinator({
      emitRequest,
      hasWidget: () => true,
      hasRelay: () => true,
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
