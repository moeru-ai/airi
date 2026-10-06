import { afterAll, describe, expect, it } from 'vitest'

import { openKirieAndroidAuthorization } from './kirie-android-authentication'

let failure: { code: string, message: string } | undefined
const channel: NonNullable<Window['AiriAndroidEventa']> = {
  onmessage: null,
  postMessage(value) {
    const request = JSON.parse(value) as { type: string, payload: { body: { invokeId: string } } }
    channel.onmessage?.(new MessageEvent('message', {
      data: JSON.stringify({
        type: `${request.type.replace('-send', failure ? '-receive-error' : '-receive')
        }-${request.payload.body.invokeId}`,
        payload: {
          body: {
            invokeId: request.payload.body.invokeId,
            content: failure ? { error: failure } : null,
          },
        },
      }),
    }))
  },
}
window.AiriAndroidEventa = channel

afterAll(() => {
  window.dispatchEvent(new Event('pagehide'))
  delete window.AiriAndroidEventa
})

// Source: WebAuthenticationPlugin.kt rejects missing browsers with BROWSER_UNAVAILABLE.
describe('kirie Android authorization errors', () => {
  it('rejects the native browser error as an Error with the Pocket code and message', async () => {
    failure = { code: 'BROWSER_UNAVAILABLE', message: 'No browser can open the authentication URL.' }
    const opening = openKirieAndroidAuthorization('https://example.invalid/auth')
    await expect(opening).rejects.toBeInstanceOf(Error)
    await expect(opening).rejects.toMatchObject(failure)
  })

  it('still resolves after a browser opens', async () => {
    failure = undefined
    await expect(openKirieAndroidAuthorization('https://example.invalid/auth')).resolves.toBeUndefined()
  })
})
