import { Buffer } from 'node:buffer'

import { Environment, SignedDataVerifier, VerificationException, VerificationStatus } from '@apple/app-store-server-library'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createVerifier } from './verifier'

// Mock only the Apple boundary. The separate verifier suite uses the real SDK
// to reject unsigned JWS input; this suite checks policy selection and errors.
vi.mock('@apple/app-store-server-library', async (importOriginal) => {
  const sdk = await importOriginal<typeof import('@apple/app-store-server-library')>()
  return {
    ...sdk,
    SignedDataVerifier: class extends sdk.SignedDataVerifier {
      /** Reports which SDK policy the facade selected. */
      async verifyAndDecodeTransaction(_jws: string) {
        return { environment: this.environment, bundleId: this.bundleId }
      }

      /** Reports the envelope policy, including Sandbox payloads without an Apple app ID. */
      async verifyAndDecodeNotification(_jws: string) {
        return { data: { environment: this.environment, bundleId: this.bundleId } }
      }
    },
  }
})

/** Encodes routing hints for the SDK boundary double, not a valid Apple signature. */
function routingJwt(payload: object) {
  return `${Buffer.from('{"alg":"ES256"}').toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`
}

/** Keeps the real verifier construction and trust policies in the test. */
async function productionVerifier(allowSandbox = true) {
  return createVerifier({
    apps: [{ bundleId: 'ai.moeru.airi-pocket', appAppleId: 123 }],
    env: 'production',
    allowSandbox,
  })
}

describe('apple-iap verifier routing', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('keeps production verification when sandbox is enabled', async () => {
    const transaction = vi.spyOn(SignedDataVerifier.prototype, 'verifyAndDecodeTransaction')
    const verifier = await productionVerifier()
    const jws = routingJwt({ bundleId: 'ai.moeru.airi-pocket', environment: Environment.PRODUCTION })
    const result = await verifier.verifyTransaction(jws)

    expect(result.environment).toBe(Environment.PRODUCTION)
    expect(transaction).toHaveBeenCalledExactlyOnceWith(jws)
  })

  it('selects Sandbox for both transaction and notification without appAppleId', async () => {
    const verifier = await productionVerifier()
    const transactionSpy = vi.spyOn(SignedDataVerifier.prototype, 'verifyAndDecodeTransaction')
    const notificationSpy = vi.spyOn(SignedDataVerifier.prototype, 'verifyAndDecodeNotification')
    const identity = { bundleId: 'ai.moeru.airi-pocket', environment: Environment.SANDBOX }
    const transaction = routingJwt(identity)
    const notification = routingJwt({ data: identity })

    expect((await verifier.verifyTransaction(transaction)).environment).toBe(Environment.SANDBOX)
    expect((await verifier.verifyNotification(notification)).data?.environment).toBe(Environment.SANDBOX)
    expect(transactionSpy).toHaveBeenCalledExactlyOnceWith(transaction)
    expect(notificationSpy).toHaveBeenCalledExactlyOnceWith(notification)
  })

  it('rejects a sandbox notification when the option is disabled', async () => {
    const notification = vi.spyOn(SignedDataVerifier.prototype, 'verifyAndDecodeNotification')
    const verifier = await productionVerifier(false)
    await expect(verifier.verifyNotification(routingJwt({
      data: { bundleId: 'ai.moeru.airi-pocket', environment: Environment.SANDBOX },
    }))).rejects.toMatchObject({ errorCode: 'ENVIRONMENT_MISMATCH' })
    expect(notification).not.toHaveBeenCalled()
  })

  it('propagates a failed signature without trying a different verifier', async () => {
    const transaction = vi.spyOn(SignedDataVerifier.prototype, 'verifyAndDecodeTransaction').mockImplementation(async () => {
      throw new VerificationException(VerificationStatus.VERIFICATION_FAILURE)
    })
    const verifier = await productionVerifier()
    await expect(verifier.verifyTransaction(routingJwt({
      bundleId: 'ai.moeru.airi-pocket',
      environment: Environment.SANDBOX,
    }))).rejects.toMatchObject({ errorCode: 'JWS_VERIFICATION_FAILED' })
    expect(transaction).toHaveBeenCalledTimes(1)
  })

  it('keeps retryable Apple verification failures retryable', async () => {
    const notification = vi.spyOn(SignedDataVerifier.prototype, 'verifyAndDecodeNotification').mockImplementation(async () => {
      throw new VerificationException(VerificationStatus.RETRYABLE_VERIFICATION_FAILURE)
    })
    const verifier = await productionVerifier()
    await expect(verifier.verifyNotification(routingJwt({
      data: { bundleId: 'ai.moeru.airi-pocket', environment: Environment.SANDBOX },
    }))).rejects.toMatchObject({ statusCode: 500 })
    expect(notification).toHaveBeenCalledTimes(1)
  })
})
