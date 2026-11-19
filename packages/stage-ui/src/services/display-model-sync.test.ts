import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { isPermanentTransferFailure } from '../libs/file-transfer/request-error'
import { completeDisplayModelUpload, reserveDisplayModelUpload } from './display-model-sync'

const reservation = { id: 'display-model-a', requestId: 'request', format: 'vrm' as const, name: 'a', originalFilename: 'a.vrm', byteSize: 1, sha256: 'a' }

function answerWith(status: number) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('refused', { status })))
}

describe('display model request failures', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // The next attempt reserves a new session, so only a refusal of the file or the account is final.
  it.each([
    ['a full quota', 402, true],
    ['a deleted model', 409, true],
    ['an expired session', 410, false],
    ['a server failure', 503, false],
  ])('classifies %s on the reservation route', async (_title, status, permanent) => {
    answerWith(status)

    const error = await reserveDisplayModelUpload(reservation).catch((reason: unknown) => reason)

    expect(isPermanentTransferFailure(error)).toBe(permanent)
  })

  it('retries a completion whose bytes have not reached storage', async () => {
    answerWith(409)

    const error = await completeDisplayModelUpload('upload').catch((reason: unknown) => reason)

    expect(isPermanentTransferFailure(error)).toBe(false)
  })

  it('does not retry a completion with a wrong file format', async () => {
    answerWith(422)

    const error = await completeDisplayModelUpload('upload').catch((reason: unknown) => reason)

    expect(isPermanentTransferFailure(error)).toBe(true)
  })
})
