import { describe, expect, it } from 'vitest'

import { electronGetServerChannelQrPayload } from './index'

describe('@proj-airi/tauri-eventa root exports', () => {
  it('exports the server-channel QR payload invoke contract', () => {
    expect(electronGetServerChannelQrPayload.sendEvent.id).toBe(
      'eventa:invoke:electron:server-channel:get-qr-payload-send',
    )
  })
})
