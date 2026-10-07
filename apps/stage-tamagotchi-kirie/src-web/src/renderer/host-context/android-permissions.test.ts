import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useHostAndroidPermissions } from './android-permissions'

const postMessage = vi.fn<(message: string) => void>()
const channel = {
  onmessage: null as ((event: MessageEvent<string>) => void) | null,
  postMessage,
}

describe('host Android permissions', () => {
  beforeEach(() => {
    vi.stubGlobal('AiriAndroidEventa', channel)
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn()
        .mockReturnValueOnce('check-id')
        .mockReturnValueOnce('request-id')
        .mockReturnValueOnce('settings-id'),
    })
    postMessage.mockReset().mockImplementation((message) => {
      const request = JSON.parse(message) as {
        payload: { body: { invokeId: string }, id: string }
      }
      queueMicrotask(() => channel.onmessage?.(new MessageEvent('message', {
        data: JSON.stringify({
          payload: {
            body: {
              content: request.payload.id.includes(':request-send')
                ? { granted: true, state: 'granted' }
                : request.payload.id.includes(':check-send')
                  ? { granted: false, state: 'prompt' }
                  : null,
              invokeId: request.payload.body.invokeId,
            },
          },
          type: request.payload.id.replace('-send', `-receive-${request.payload.body.invokeId}`),
        }),
      })))
    })
  })

  it('checks, requests, and opens settings through the Android host', async () => {
    const permissions = useHostAndroidPermissions()

    await expect(permissions.check('notifications')).resolves.toEqual({ granted: false, state: 'prompt' })
    await expect(permissions.request('microphone')).resolves.toEqual({ granted: true, state: 'granted' })
    await permissions.openSettings('microphone')

    expect(postMessage).toHaveBeenNthCalledWith(1, JSON.stringify({
      payload: {
        body: { content: { permission: 'notifications' }, invokeId: 'check-id' },
        id: 'eventa:invoke:airi:android:permission:check-send',
      },
    }))
    expect(postMessage).toHaveBeenNthCalledWith(2, JSON.stringify({
      payload: {
        body: { content: { permission: 'microphone' }, invokeId: 'request-id' },
        id: 'eventa:invoke:airi:android:permission:request-send',
      },
    }))
    expect(postMessage).toHaveBeenNthCalledWith(3, JSON.stringify({
      payload: {
        body: { content: { permission: 'microphone' }, invokeId: 'settings-id' },
        id: 'eventa:invoke:airi:android:permission:open-settings-send',
      },
    }))
  })
})
