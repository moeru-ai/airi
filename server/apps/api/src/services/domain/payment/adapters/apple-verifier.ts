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

const ROOT_CA_FILENAMES = ['AppleRootCA-G2.cer', 'AppleRootCA-G3.cer'] as const

/**
 * Creates an Apple IAP StoreKit 2 JWS verifier.
 *
 * Channel routes call this after they receive a client JWS.
 * Payment CORE never sees the raw signed string.
 */
export async function createAppleIapVerifier(options: AppleIapVerifierOptions) {
  const rootCertificatesDir = options.rootCertificatesDir ?? defaultRootCertificatesDir()
  const rootCertificates = await loadAppleRootCertificates(rootCertificatesDir)

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
    try {
      return await verifier.verifyAndDecodeTransaction(jws)
    }
    catch (error) {
      if (error instanceof VerificationException) {
        switch (error.status) {
          case VerificationStatus.INVALID_APP_IDENTIFIER:
            throw createBadRequestError('Bundle identifier mismatch', 'BUNDLE_MISMATCH')
          case VerificationStatus.INVALID_ENVIRONMENT:
            throw createBadRequestError('Transaction environment mismatch', 'ENVIRONMENT_MISMATCH')
          case VerificationStatus.OK:
          case VerificationStatus.VERIFICATION_FAILURE:
          case VerificationStatus.RETRYABLE_VERIFICATION_FAILURE:
          case VerificationStatus.INVALID_CHAIN_LENGTH:
          case VerificationStatus.INVALID_CERTIFICATE:
          case VerificationStatus.FAILURE:
            logger.withError(error).warn('JWS transaction verification failed')
            throw createBadRequestError('Signed transaction failed verification', 'JWS_VERIFICATION_FAILED')
          default: {
            const exhaustive: never = error.status
            logger.withError(error).withField('status', String(exhaustive)).warn('Unhandled verification status')
            throw createBadRequestError('Signed transaction failed verification', 'JWS_VERIFICATION_FAILED')
          }
        }
      }

      logger.withError(error).warn('JWS transaction verification failed')
      throw createBadRequestError('Signed transaction failed verification', 'JWS_VERIFICATION_FAILED')
    }
  }

  return { verifyTransaction }
}

export type AppleIapVerifier = Awaited<ReturnType<typeof createAppleIapVerifier>>

/**
 * Maps AIRI Apple IAP env config to Apple's verifier environment.
 */
function appleIapEnvironmentToStoreKitEnvironment(env: AppleIapEnv): Environment {
  if (env === 'production')
    return Environment.PRODUCTION
  if (env === 'xcode')
    return Environment.XCODE
  return Environment.SANDBOX
}

async function loadAppleRootCertificates(dir: string): Promise<Buffer[]> {
  return Promise.all(
    ROOT_CA_FILENAMES.map(async (name) => {
      try {
        return await readFile(join(dir, name))
      }
      catch (error) {
        logger.withError(error).withFields({ dir, file: name }).error('Failed to read Apple Root CA certificate')
        throw new Error(`Failed to read Apple Root CA file ${name} in ${dir}`)
      }
    }),
  )
}

function defaultRootCertificatesDir(): string {
  // src/services/domain/payment/adapters/apple-verifier.ts
  // -> server/apps/api/assets/apple-root-ca
  return fileURLToPath(new URL('../../../../../assets/apple-root-ca', import.meta.url))
}
