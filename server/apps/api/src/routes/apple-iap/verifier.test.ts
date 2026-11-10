import { Buffer } from 'node:buffer'

import { Environment } from '@apple/app-store-server-library'
import { describe, expect, it } from 'vitest'

import { createVerifier } from './verifier'

const pocketBundleId = 'ai.moeru.airi-pocket'
const liteBundleId = 'ai.moeru.airi-lite'

/** Builds deliberately unsigned input to exercise rejection by the real Apple library. */
function unsignedJwt(payload: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${header}.${body}.`
}

describe('apple-iap verifier', () => {
  /** Uses both trusted bundles without weakening signature verification. */
  async function createTestVerifier() {
    return createVerifier({
      apps: [
        { bundleId: pocketBundleId },
        { bundleId: liteBundleId },
      ],
      env: 'sandbox',
    })
  }

  it('rejects an unknown bundle id before signature checks', async () => {
    const verifier = await createTestVerifier()

    await expect(verifier.verifyTransaction(unsignedJwt({ bundleId: 'ai.moeru.unknown' })))
      .rejects
      .toMatchObject({ statusCode: 400, errorCode: 'BUNDLE_MISMATCH' })

    await expect(verifier.verifyNotification(unsignedJwt({
      data: { bundleId: 'ai.moeru.unknown' },
    })))
      .rejects
      .toMatchObject({ statusCode: 400, errorCode: 'BUNDLE_MISMATCH' })
  })

  it('rejects a malformed JWS before signature checks', async () => {
    const verifier = await createTestVerifier()

    await expect(verifier.verifyTransaction('not-a-jwt'))
      .rejects
      .toMatchObject({ statusCode: 400, errorCode: 'JWS_VERIFICATION_FAILED' })
  })

  it('routes a known bundle id into signature verification', async () => {
    const verifier = await createTestVerifier()

    await expect(verifier.verifyTransaction(unsignedJwt({ bundleId: pocketBundleId, environment: Environment.SANDBOX })))
      .rejects
      .toMatchObject({ statusCode: 400, errorCode: 'JWS_VERIFICATION_FAILED' })

    await expect(verifier.verifyNotification(unsignedJwt({
      data: { bundleId: liteBundleId, environment: Environment.SANDBOX },
    })))
      .rejects
      .toMatchObject({ statusCode: 400, errorCode: 'JWS_VERIFICATION_FAILED' })
  })

  it('requires an App Store Connect id for every app in production', async () => {
    await expect(createVerifier({
      apps: [{ bundleId: pocketBundleId }],
      env: 'production',
    })).rejects.toThrow('App Store Connect id')
  })

  it('keeps sandbox disabled on production unless explicitly enabled', async () => {
    const verifier = await createVerifier({
      apps: [{ bundleId: pocketBundleId, appAppleId: 123 }],
      env: 'production',
    })
    await expect(verifier.verifyTransaction(unsignedJwt({
      bundleId: pocketBundleId,
      environment: Environment.SANDBOX,
    }))).rejects.toMatchObject({ statusCode: 400, errorCode: 'ENVIRONMENT_MISMATCH' })
  })

  it('does not trust unsigned sandbox transactions or notifications when enabled', async () => {
    const verifier = await createVerifier({
      apps: [{ bundleId: pocketBundleId, appAppleId: 123 }],
      env: 'production',
      allowSandbox: true,
    })
    await expect(verifier.verifyTransaction(unsignedJwt({
      bundleId: pocketBundleId,
      environment: Environment.SANDBOX,
    }))).rejects.toMatchObject({ statusCode: 400, errorCode: 'JWS_VERIFICATION_FAILED' })
    await expect(verifier.verifyNotification(unsignedJwt({
      data: { bundleId: pocketBundleId, environment: Environment.SANDBOX },
    }))).rejects.toMatchObject({ statusCode: 400, errorCode: 'JWS_VERIFICATION_FAILED' })
  })

  it('never enables unsigned Xcode verification on a production server', async () => {
    const verifier = await createVerifier({
      apps: [{ bundleId: pocketBundleId, appAppleId: 123 }],
      env: 'production',
      allowSandbox: true,
    })
    await expect(verifier.verifyTransaction(unsignedJwt({
      bundleId: pocketBundleId,
      environment: Environment.XCODE,
    }))).rejects.toMatchObject({ statusCode: 400, errorCode: 'ENVIRONMENT_MISMATCH' })
  })
})
