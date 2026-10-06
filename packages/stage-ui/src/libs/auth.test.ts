import { afterEach, describe, expect, it } from 'vitest'

import { isSigningIn, registerAuthorizationHandler, triggerSignIn } from './auth'

describe('isSigningIn', () => {
  afterEach(() => {
    registerAuthorizationHandler(async () => {})
  })

  it('stays true while the authorization handler is pending', async () => {
    let finish: (() => void) | undefined
    registerAuthorizationHandler(() => new Promise<void>((resolve) => {
      finish = resolve
    }))

    expect(isSigningIn.value).toBe(false)
    const pending = triggerSignIn()
    await expect.poll(() => finish).toBeDefined()
    expect(isSigningIn.value).toBe(true)

    finish?.()
    await pending
    expect(isSigningIn.value).toBe(false)
  })

  it('resets when the authorization handler fails', async () => {
    registerAuthorizationHandler(async () => {
      throw new Error('authorization failed')
    })

    await expect(triggerSignIn()).rejects.toThrow('authorization failed')
    expect(isSigningIn.value).toBe(false)
  })
})
