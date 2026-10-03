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
import { object, optional, safeParse, string } from 'valibot'

import { ApiError, createBadRequestError, createInternalError, createServiceUnavailableError } from '../../utils/error'

const logger = useLogger('apple-iap.verifier')

export type StoreKitEnv = 'sandbox' | 'production' | 'xcode'

export interface VerifierOptions {
  apps: Array<{ bundleId: string, appAppleId?: number }>
  env: StoreKitEnv
  /** Permit Sandbox verification beside Production. Account authorization is enforced by the routes. @default false */
  allowSandbox?: boolean
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
  const verifiers = new Map<string, Map<string, SignedDataVerifier>>()
  const environments = [STOREKIT_ENVIRONMENTS[options.env]]
  if (options.env === 'production' && options.allowSandbox)
    environments.push(Environment.SANDBOX)

  for (const app of options.apps) {
    verifiers.set(app.bundleId, new Map(environments.map(environment => [
      environment,
      new SignedDataVerifier(rootCertificates, true, environment, app.bundleId, app.appAppleId),
    ])))
  }

  /** Selects a trust policy from unverified claims; the SDK must verify every claim again. */
  function verifierFor(jws: string, kind: 'transaction' | 'notification'): SignedDataVerifier {
    const identity = peekIdentity(jws, kind)
    const appVerifiers = identity?.bundleId ? verifiers.get(identity.bundleId) : undefined
    if (!appVerifiers)
      throw createBadRequestError('Bundle identifier mismatch', 'BUNDLE_MISMATCH')
    const selected = identity?.environment ? appVerifiers.get(identity.environment) : undefined
    if (!selected)
      throw createBadRequestError('Transaction environment mismatch', 'ENVIRONMENT_MISMATCH')
    return selected
  }

  /** Verifies the transaction signature and its selected app/environment policy. */
  async function verifyTransaction(jws: string): Promise<JWSTransactionDecodedPayload> {
    try {
      return await verifierFor(jws, 'transaction').verifyAndDecodeTransaction(jws)
    }
    catch (error) {
      return mapVerificationError(error, 'transaction')
    }
  }

  /** Verifies the notification envelope before a route reads its transaction. */
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

const RoutingIdentitySchema = object({
  bundleId: optional(string()),
  environment: optional(string()),
})
const NotificationRoutingSchema = object({
  data: optional(RoutingIdentitySchema),
  summary: optional(RoutingIdentitySchema),
  appData: optional(RoutingIdentitySchema),
  externalPurchaseToken: optional(object({
    bundleId: optional(string()),
    externalPurchaseId: optional(string()),
  })),
})

/** Reads routing hints only. No decoded value can authorize a purchase without SDK verification. */
function peekIdentity(jws: string, kind: 'transaction' | 'notification') {
  try {
    const payload = decodeJwt(jws)
    if (kind === 'transaction') {
      const parsed = safeParse(RoutingIdentitySchema, payload)
      return parsed.success ? parsed.output : undefined
    }

    const parsed = safeParse(NotificationRoutingSchema, payload)
    if (!parsed.success)
      return undefined
    const { data, summary, externalPurchaseToken, appData } = parsed.output
    if (data)
      return data
    if (summary)
      return summary
    if (externalPurchaseToken) {
      return {
        bundleId: externalPurchaseToken.bundleId,
        environment: externalPurchaseToken.externalPurchaseId?.startsWith('SANDBOX')
          ? Environment.SANDBOX
          : Environment.PRODUCTION,
      }
    }
    return appData
  }
  catch {
    throw createBadRequestError(`Signed ${kind} failed verification`, 'JWS_VERIFICATION_FAILED')
  }
}

/** Maps SDK errors to retryable server errors or permanent input failures. */
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
