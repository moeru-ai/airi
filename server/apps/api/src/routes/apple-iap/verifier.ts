import type { Buffer } from 'node:buffer'

import type { JWSTransactionDecodedPayload, ResponseBodyV2DecodedPayload } from '@apple/app-store-server-library'

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
import { decodeJwt } from 'jose'

import { ApiError, createBadRequestError, createInternalError, createServiceUnavailableError } from '../../utils/error'

const logger = useLogger('apple-iap.verifier')

export type StoreKitEnv = 'sandbox' | 'production' | 'xcode'

export interface VerifierOptions {
  apps: Array<{ bundleId: string, appAppleId?: number }>
  env: StoreKitEnv
}

const ROOT_CA_DIR = fileURLToPath(new URL('../../../assets/apple-root-ca', import.meta.url))
const ROOT_CA_FILENAMES = ['AppleRootCA-G2.cer', 'AppleRootCA-G3.cer'] as const

const STOREKIT_ENVIRONMENTS: Record<StoreKitEnv, Environment> = {
  production: Environment.PRODUCTION,
  xcode: Environment.XCODE,
  sandbox: Environment.SANDBOX,
}

/**
 * Creates StoreKit 2 JWS verifiers for every trusted app.
 *
 * Apple's library binds one bundle id per verifier. This facade peeks at the
 * unverified payload only to pick the matching verifier. Trust comes from the
 * second pass, which checks the signature, bundle id, and environment.
 */
export async function createVerifier(options: VerifierOptions) {
  if (options.env === 'production' && options.apps.some(app => app.appAppleId == null))
    throw new Error('Each APPLE_IAP_APPS entry needs an App Store Connect id when APPLE_IAP_ENV is production')

  const rootCertificates = await loadAppleRootCertificates()
  const verifiers = new Map<string, SignedDataVerifier>()

  for (const app of options.apps) {
    verifiers.set(app.bundleId, new SignedDataVerifier(
      rootCertificates,
      true,
      STOREKIT_ENVIRONMENTS[options.env],
      app.bundleId,
      app.appAppleId,
    ))
  }

  function verifierFor(jws: string, kind: 'transaction' | 'notification'): SignedDataVerifier {
    const bundleId = peekBundleId(jws, kind)
    const selected = bundleId ? verifiers.get(bundleId) : undefined
    if (!selected)
      throw createBadRequestError('Bundle identifier mismatch', 'BUNDLE_MISMATCH')
    return selected
  }

  async function verifyTransaction(jws: string): Promise<JWSTransactionDecodedPayload> {
    try {
      return await verifierFor(jws, 'transaction').verifyAndDecodeTransaction(jws)
    }
    catch (error) {
      return mapVerificationError(error, 'transaction')
    }
  }

  async function verifyNotification(signedPayload: string): Promise<ResponseBodyV2DecodedPayload> {
    try {
      return await verifierFor(signedPayload, 'notification').verifyAndDecodeNotification(signedPayload)
    }
    catch (error) {
      return mapVerificationError(error, 'notification')
    }
  }

  return { verifyTransaction, verifyNotification }
}

function peekBundleId(jws: string, kind: 'transaction' | 'notification'): string | undefined {
  try {
    const payload = decodeJwt(jws)
    if (kind === 'transaction')
      return readStringField(payload, 'bundleId')

    for (const key of ['data', 'summary', 'externalPurchaseToken', 'appData']) {
      const bundleId = readStringField(payload[key], 'bundleId')
      if (bundleId)
        return bundleId
    }

    return undefined
  }
  catch {
    throw createBadRequestError(`Signed ${kind} failed verification`, 'JWS_VERIFICATION_FAILED')
  }
}

function readStringField(value: unknown, key: string): string | undefined {
  if (!isRecord(value))
    return undefined
  const field = value[key]
  return typeof field === 'string' && field !== '' ? field : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function mapVerificationError(error: unknown, kind: 'transaction' | 'notification'): never {
  if (error instanceof ApiError)
    throw error
  if (error instanceof VerificationException) {
    if (error.status === VerificationStatus.INVALID_APP_IDENTIFIER)
      throw createBadRequestError('Bundle identifier mismatch', 'BUNDLE_MISMATCH')
    if (error.status === VerificationStatus.INVALID_ENVIRONMENT)
      throw createBadRequestError('Transaction environment mismatch', 'ENVIRONMENT_MISMATCH')
    if (error.status === VerificationStatus.RETRYABLE_VERIFICATION_FAILURE) {
      logger.withError(error).error(`JWS ${kind} verification failed`)
      throw createInternalError(`Signed ${kind} verification failed`)
    }

    logger.withError(error).warn(`JWS ${kind} verification failed`)
    throw createBadRequestError(`Signed ${kind} failed verification`, 'JWS_VERIFICATION_FAILED')
  }

  logger.withError(error).error(`JWS ${kind} verification failed`)
  throw createInternalError(`Signed ${kind} verification failed`)
}

export type Verifier = Awaited<ReturnType<typeof createVerifier>>

export function requireVerifier(verifier: Verifier | null): Verifier {
  if (!verifier)
    throw createServiceUnavailableError('Apple IAP is not configured', 'APPLE_IAP_DISABLED')
  return verifier
}

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
