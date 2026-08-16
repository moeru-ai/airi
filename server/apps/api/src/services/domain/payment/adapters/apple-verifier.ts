import type { Buffer } from 'node:buffer'

import type { JWSTransactionDecodedPayload } from '@apple/app-store-server-library'

import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Environment, SignedDataVerifier } from '@apple/app-store-server-library'
import { useLogger } from '@guiiai/logg'

import { createBadRequestError } from '../../../../utils/error'

const logger = useLogger('payment.apple.verifier')

export type AppleIapEnv = 'sandbox' | 'production' | 'xcode'

export interface AppleIapVerifierOptions {
  /** App Store bundle identifier, for example `ai.moeru.airi-pocket`. */
  bundleId: string
  /** Target App Store environment for payload cross-checks. */
  env: AppleIapEnv
  /**
   * App Store Connect numeric app id.
   * Required for production verification in `@apple/app-store-server-library`.
   */
  appAppleId?: number
  /** Optional override of the Apple Root CA directory. */
  rootCertificatesDir?: string
}

/**
 * Creates an Apple IAP StoreKit 2 JWS verifier.
 *
 * Channel routes call this after they receive a client JWS.
 * Payment CORE never sees the raw signed string.
 */
export async function createAppleIapVerifier(options: AppleIapVerifierOptions) {
  const rootCertificatesDir = options.rootCertificatesDir ?? defaultRootCertificatesDir()
  const rootCertificates = await loadAppleRootCertificates(rootCertificatesDir)
  if (rootCertificates.length === 0)
    throw new Error(`No Apple Root CA .cer files found in ${rootCertificatesDir}`)

  if (options.env === 'production' && options.appAppleId == null)
    throw new Error('APPLE_APP_APPLE_ID is required when APPLE_IAP_ENV is production')

  const verifier = new SignedDataVerifier(
    rootCertificates,
    // NOTICE:
    // Keep OCSP / expiration online checks off. Apple CA OCSP can be slow, and
    // this path sits on the purchase critical path.
    // Refresh root certs manually via server/apps/api/assets/apple-root-ca/README.md.
    // Removal condition: enable when an offline CRL/OCSP cache is available.
    false,
    appleIapEnvironmentToStoreKitEnvironment(options.env),
    options.bundleId,
    options.appAppleId,
  )

  async function verifyTransaction(jws: string): Promise<JWSTransactionDecodedPayload> {
    let payload: JWSTransactionDecodedPayload
    try {
      payload = await verifier.verifyAndDecodeTransaction(jws)
    }
    catch (error) {
      logger.withError(error).warn('JWS transaction verification failed')
      throw createBadRequestError('Signed transaction failed verification', 'JWS_VERIFICATION_FAILED')
    }

    assertBundleAndEnvironment(payload.bundleId, payload.environment, options)
    return payload
  }

  return { verifyTransaction }
}

export type AppleIapVerifier = Awaited<ReturnType<typeof createAppleIapVerifier>>

/**
 * Maps AIRI Apple IAP env config to Apple's verifier environment.
 */
export function appleIapEnvironmentToStoreKitEnvironment(env: AppleIapEnv): Environment {
  if (env === 'production')
    return Environment.PRODUCTION
  if (env === 'xcode')
    return Environment.XCODE
  return Environment.SANDBOX
}

function assertBundleAndEnvironment(
  bundleId: string | undefined,
  environment: string | undefined,
  options: AppleIapVerifierOptions,
) {
  if (!bundleId || bundleId !== options.bundleId) {
    throw createBadRequestError('Bundle identifier mismatch', 'BUNDLE_MISMATCH', {
      expected: options.bundleId,
      actual: bundleId,
    })
  }

  if (!isEnvironmentAcceptable(environment, options.env)) {
    throw createBadRequestError('Transaction environment mismatch', 'ENVIRONMENT_MISMATCH', {
      expected: options.env,
      actual: environment,
    })
  }
}

/**
 * In sandbox mode, also accept Xcode StoreKit Configuration and LocalTesting
 * payloads so CI and local builds can post JWS against a staging server.
 */
function isEnvironmentAcceptable(actual: string | undefined, env: AppleIapEnv): boolean {
  if (env === 'production')
    return actual === Environment.PRODUCTION
  return actual === Environment.SANDBOX
    || actual === Environment.XCODE
    || actual === Environment.LOCAL_TESTING
}

async function loadAppleRootCertificates(dir: string): Promise<Buffer[]> {
  let entries: string[]
  try {
    entries = await readdir(dir)
  }
  catch (error) {
    logger.withError(error).withField('dir', dir).error('Failed to read Apple Root CA directory')
    return []
  }

  const cerFiles = entries.filter(name => name.endsWith('.cer'))
  return Promise.all(cerFiles.map(name => readFile(join(dir, name))))
}

function defaultRootCertificatesDir(): string {
  // src/services/domain/payment/adapters/apple-verifier.ts
  // -> server/apps/api/assets/apple-root-ca
  return fileURLToPath(new URL('../../../../../assets/apple-root-ca', import.meta.url))
}
