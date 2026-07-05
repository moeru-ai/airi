import type { ServerChannelQrPayload } from '@proj-airi/stage-shared/server-channel-qr'

import { describe, expect, it, vi } from 'vitest'

import {
  createServerChannelQrPayloadController,
  serverChannelQrPayloadText,
  serverChannelQrSvgDataUrl,
} from './settings-connection'

const payload: ServerChannelQrPayload = {
  type: 'airi:server-channel',
  version: 1,
  urls: ['ws://192.168.1.10:49152/ws'],
  authToken: 'test-token',
}

describe('settings connection QR helpers', () => {
  it('serializes the exact shared QR payload JSON', () => {
    expect(serverChannelQrPayloadText(payload)).toBe(JSON.stringify(payload))
  })

  it('builds an SVG data URL for an available payload', () => {
    const source = serverChannelQrSvgDataUrl(payload)
    const prefix = 'data:image/svg+xml;utf8,'
    const svg = decodeURIComponent(source.slice(prefix.length))

    expect(source.startsWith(prefix)).toBe(true)
    expect(svg).toContain('<svg')
    expect(svg).toContain('#FFFFFF')
    expect(svg).toContain('#121212')
  })

  it('returns an empty QR source for an unavailable payload', () => {
    expect(serverChannelQrPayloadText(undefined)).toBe('')
    expect(serverChannelQrPayloadText({ ...payload, urls: [] })).toBe('')
    expect(serverChannelQrSvgDataUrl(undefined)).toBe('')
    expect(serverChannelQrSvgDataUrl({ ...payload, urls: [] })).toBe('')
  })

  it('refreshes payload state from the supplied loader', async () => {
    const loadPayload = vi.fn(() => Promise.resolve(payload))
    const controller = createServerChannelQrPayloadController(loadPayload)

    await controller.refreshPayload()

    expect(loadPayload).toHaveBeenCalledOnce()
    expect(controller.loading.value).toBe(false)
    expect(controller.errorMessage.value).toBe('')
    expect(controller.payload.value).toEqual(payload)
    expect(controller.candidateUrls.value).toEqual(['ws://192.168.1.10:49152/ws'])
    expect(controller.payloadText.value).toBe(JSON.stringify(payload))
    expect(controller.qrCodeSource.value.startsWith('data:image/svg+xml;utf8,')).toBe(true)
  })

  it('ignores refresh requests while a payload load is already running', async () => {
    let resolvePayload!: (value: ServerChannelQrPayload) => void
    const pendingPayload = new Promise<ServerChannelQrPayload>((resolve) => {
      resolvePayload = resolve
    })
    const loadPayload = vi.fn(() => pendingPayload)
    const controller = createServerChannelQrPayloadController(loadPayload)

    const firstRefresh = controller.refreshPayload()
    const secondRefresh = controller.refreshPayload()

    expect(loadPayload).toHaveBeenCalledOnce()
    expect(controller.loading.value).toBe(true)

    resolvePayload(payload)
    await Promise.all([firstRefresh, secondRefresh])

    expect(controller.loading.value).toBe(false)
    expect(controller.payload.value).toEqual(payload)
  })

  it('clears stale payload and stores error text when refresh fails', async () => {
    const controller = createServerChannelQrPayloadController(() => Promise.resolve(payload))
    await controller.refreshPayload()

    const failingController = createServerChannelQrPayloadController(() =>
      Promise.reject(new Error('server not ready')),
    )

    await failingController.refreshPayload()

    expect(failingController.loading.value).toBe(false)
    expect(failingController.payload.value).toBeUndefined()
    expect(failingController.errorMessage.value).toBe('server not ready')
    expect(failingController.qrCodeSource.value).toBe('')
  })
})
