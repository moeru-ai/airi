import type { Buffer } from 'node:buffer'

import type { JWSTransactionDecodedPayload } from '@apple/app-store-server-library'

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  Environment,
  SignedDataVerifier,
  VerificationException,
  VerificationStatus,
} from '@apple/app-store-server-library'
import { useLogger } from '@guiiai/logg'

import { createBadRequestError } from '../../utils/error'

const logger = useLogger('apple-iap.verifier')

export type StoreKitEnv = 'sandbox' | 'production' | 'xcode'

export interface VerifierOptions {
  /** App Store bundle identifier, for example `ai.moeru.airi-pocket`. */
  bundleId: string
  /** Target App Store environment for payload cross-checks. */
  env: StoreKitEnv
  /**
   * App Store Connect numeric app id.
   * Required for production verification in `@apple/app-store-server-library`.
   */
  appAppleId?: number
}

const ROOT_CA_DIR = fileURLToPath(new URL('../../../assets/apple-root-ca', import.meta.url))
const ROOT_CA_FILENAMES = ['AppleRootCA-G2.cer', 'AppleRootCA-G3.cer'] as const

const STOREKIT_ENVIRONMENTS: Record<StoreKitEnv, Environment> = {
  production: Environment.PRODUCTION,
  xcode: Environment.XCODE,
  sandbox: Environment.SANDBOX,
}

/**
 * Creates an Apple IAP StoreKit 2 JWS verifier.
 *
 * Channel routes call this after they receive a client JWS.
 * Payment CORE never sees the raw signed string.
 */
export async function createVerifier(options: VerifierOptions) {
  const rootCertificates = await loadAppleRootCertificates()

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
    STOREKIT_ENVIRONMENTS[options.env],
    options.bundleId,
    options.appAppleId,
  )

  async function verifyTransaction(jws: string): Promise<JWSTransactionDecodedPayload> {
    try {
      return await verifier.verifyAndDecodeTransaction(jws)
    }
    catch (error) {
      if (error instanceof VerificationException) {
        if (error.status === VerificationStatus.INVALID_APP_IDENTIFIER)
          throw createBadRequestError('Bundle identifier mismatch', 'BUNDLE_MISMATCH')
        if (error.status === VerificationStatus.INVALID_ENVIRONMENT)
          throw createBadRequestError('Transaction environment mismatch', 'ENVIRONMENT_MISMATCH')
      }

      logger.withError(error).warn('JWS transaction verification failed')
      throw createBadRequestError('Signed transaction failed verification', 'JWS_VERIFICATION_FAILED')
    }
  }

  return { verifyTransaction }
}

export type Verifier = Awaited<ReturnType<typeof createVerifier>>

async function loadAppleRootCertificates(): Promise<Buffer[]> {
  return Promise.all(
    ROOT_CA_FILENAMES.map(async (name) => {
      try {
        return await readFile(join(ROOT_CA_DIR, name))
      }
      catch (error) {
        logger.withError(error).withField('file', name).error('Failed to read Apple Root CA certificate')
        throw new Error(`Failed to read Apple Root CA file ${name}`)
      }
    }),
  )
}
