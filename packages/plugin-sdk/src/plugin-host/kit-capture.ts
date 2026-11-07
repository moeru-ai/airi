import type { HostClientFactory, KitContract, KitProvider, KitRef } from '../kit'
import type { KitDescriptor, KitDescriptorSnapshot } from './shared/kits'

import { safeParse } from 'valibot'

import {
  captureKitContractInput,
  KitContractCaptureError,
  KitContractInputError,
  normalizeKitContractInput,
} from '../kit/contract'
import { isExactSemanticVersion } from '../kit/exact-semantic-version'
import { normalizeExposurePolicyOptions } from '../kit/exposure-policy-options'
import { kitDescriptorSchema } from './shared/kits'

/** Host payload category of one Host Kit registration. */
export type HostSourceKind = 'descriptor' | 'client-factory'

/** The owner of a provided Kit, used in capture errors. */
export interface KitCaptureOwner {
  readonly extensionId?: string
  readonly sessionId?: string
}

/** Stable code for a Provider registration failure. */
export type KitProviderRegistrationErrorCode
  = | 'provider-slot-conflict'
    | 'invalid-host-source'
    | 'provide-after-setup'
    | 'undeclared-kit'
    | 'kit-version-mismatch'
    | 'kit-exposure-mismatch'
    | 'duplicate-provide'
    | 'invalid-kit-contract'
    | 'invalid-kit-provider'
    | 'missing-declared-kit'

/** A stable error code identifies failed registration without parsing its message. */
export class KitProviderRegistrationError extends Error {
  constructor(
    readonly code: KitProviderRegistrationErrorCode,
    readonly kitId: string,
    readonly extensionId?: string,
    readonly sessionId?: string,
    options?: { sourceKind?: HostSourceKind },
  ) {
    super(`${code}: ${kitId}`)
    this.name = 'KitProviderRegistrationError'
    this.sourceKind = options?.sourceKind
  }

  /** Host payload category involved in the failure. */
  readonly sourceKind?: HostSourceKind
}

export interface AcceptedKitContract {
  readonly contract: KitContract
  readonly methodNames: readonly string[]
  readonly eventNames: readonly string[]
}

export interface AcceptedProviderEndpoint {
  readonly methods: Readonly<Record<string, unknown>>
}

interface CapturedHostDescriptor {
  readonly kitId: unknown
  readonly version: unknown
  readonly runtimesAreArray: boolean
  readonly runtimes: readonly unknown[]
  readonly capabilitiesAreArray: boolean
  readonly capabilities: readonly {
    readonly key: unknown
    readonly actionsAreArray: boolean
    readonly actions: readonly unknown[]
  }[]
}

interface CapturedHostClientFactory {
  readonly id: unknown
  readonly version: unknown
  readonly createClient: unknown
  readonly policiesAreArray: boolean
  readonly allowedExposePolicies?: readonly unknown[]
  readonly defaultExposePolicy: unknown
}

interface CapturedProviderMethod {
  readonly name: PropertyKey
  readonly enumerable: boolean
  readonly handler: unknown
}

/**
 * Normalizes a captured Host descriptor.
 *
 * @example
 * normalizeHostDescriptor({ kitId: 'example', version: '1.0.0', runtimesAreArray: true, runtimes: ['electron'], capabilitiesAreArray: true, capabilities: [] })
 * // => { kitId: 'example', version: '1.0.0', runtimes: ['electron'], capabilities: [] }
 */
function normalizeHostDescriptor(input: CapturedHostDescriptor): KitDescriptorSnapshot {
  const kitId = typeof input.kitId === 'string' ? input.kitId : ''
  const descriptorResult = input.runtimesAreArray
    && input.capabilitiesAreArray
    && input.capabilities.every(capability => capability.actionsAreArray)
    ? safeParse(kitDescriptorSchema, {
        kitId: input.kitId,
        version: input.version,
        runtimes: input.runtimes,
        capabilities: input.capabilities.map(capability => ({
          key: capability.key,
          actions: capability.actions,
        })),
      })
    : { success: false as const }
  if (!descriptorResult.success) {
    throw new KitProviderRegistrationError('invalid-host-source', kitId, undefined, undefined, { sourceKind: 'descriptor' })
  }

  const capabilities = descriptorResult.output.capabilities.map(capability => Object.freeze({
    key: capability.key,
    actions: Object.freeze([...capability.actions]),
  }))
  const snapshot: KitDescriptorSnapshot = {
    kitId: descriptorResult.output.kitId,
    version: descriptorResult.output.version,
    runtimes: Object.freeze([...descriptorResult.output.runtimes]),
    capabilities: Object.freeze(capabilities),
  }
  return Object.freeze(snapshot)
}

/**
 * Normalizes captured Host Client factory data.
 *
 * @example
 * normalizeHostClientFactory({ id: 'example', version: '1.0.0', createClient: () => ({}), policiesAreArray: true, defaultExposePolicy: undefined })
 * // => { id: 'example', version: '1.0.0', createClient: [Function] }
 */
function normalizeHostClientFactory<TClient>(input: CapturedHostClientFactory): KitRef<TClient> {
  const id = typeof input.id === 'string' ? input.id : ''
  if (!id || id.trim() !== id
    || typeof input.version !== 'string' || !isExactSemanticVersion(input.version)
    || typeof input.createClient !== 'function') {
    throw new KitProviderRegistrationError('invalid-host-source', id, undefined, undefined, { sourceKind: 'client-factory' })
  }

  const policiesResult = normalizeExposurePolicyOptions(input)
  if (!policiesResult.success) {
    throw new KitProviderRegistrationError('invalid-host-source', id, undefined, undefined, { sourceKind: 'client-factory' })
  }

  const snapshot: KitRef<TClient> = {
    id,
    version: input.version,
    createClient: input.createClient as HostClientFactory<TClient>,
    allowedExposePolicies: policiesResult.output.declaredExposePolicies,
    defaultExposePolicy: policiesResult.output.defaultExposePolicy,
  }
  return Object.freeze(snapshot)
}

function invalidHostSource(sourceKind: HostSourceKind | undefined, kitId: string): KitProviderRegistrationError {
  return new KitProviderRegistrationError('invalid-host-source', kitId, undefined, undefined, { sourceKind })
}

function readHostSource<T>(sourceKind: HostSourceKind | undefined, kitId: string, read: () => T): T {
  try {
    return read()
  }
  catch {
    throw invalidHostSource(sourceKind, kitId)
  }
}

function captureHostDescriptorInput(input: unknown): CapturedHostDescriptor {
  const descriptor = input as KitDescriptor | null | undefined
  const kitId = readHostSource('descriptor', '', () => descriptor?.kitId)
  const capturedKitId = typeof kitId === 'string' ? kitId : ''
  const version = readHostSource('descriptor', capturedKitId, () => descriptor?.version)
  const runtimes = readHostSource('descriptor', capturedKitId, () => descriptor?.runtimes)
  const runtimesAreArray = readHostSource('descriptor', capturedKitId, () => Array.isArray(runtimes))
  const capabilities = readHostSource('descriptor', capturedKitId, () => descriptor?.capabilities)
  const capabilitiesAreArray = readHostSource('descriptor', capturedKitId, () => Array.isArray(capabilities))
  const capturedCapabilities: CapturedHostDescriptor['capabilities'][number][] = []
  if (capabilitiesAreArray) {
    const capabilityInputs = readHostSource('descriptor', capturedKitId, () => Array.from(capabilities as KitDescriptor['capabilities']))
    for (const capability of capabilityInputs) {
      const key = readHostSource('descriptor', capturedKitId, () => capability?.key)
      const actions = readHostSource('descriptor', capturedKitId, () => capability?.actions)
      const actionsAreArray = readHostSource('descriptor', capturedKitId, () => Array.isArray(actions))
      capturedCapabilities.push({
        key,
        actionsAreArray,
        actions: actionsAreArray
          ? readHostSource('descriptor', capturedKitId, () => Array.from(actions))
          : [],
      })
    }
  }

  return {
    kitId,
    version,
    runtimesAreArray,
    runtimes: runtimesAreArray
      ? readHostSource('descriptor', capturedKitId, () => Array.from(runtimes as KitDescriptor['runtimes']))
      : [],
    capabilitiesAreArray,
    capabilities: capturedCapabilities,
  }
}

function captureHostClientFactoryInput(input: unknown): CapturedHostClientFactory {
  const factory = input as KitRef<unknown> | null | undefined
  const id = readHostSource('client-factory', '', () => factory?.id)
  const capturedId = typeof id === 'string' ? id : ''
  const policies = readHostSource('client-factory', capturedId, () => factory?.allowedExposePolicies)
  const policiesAreArray = policies === undefined
    || readHostSource('client-factory', capturedId, () => Array.isArray(policies))
  return {
    id,
    version: readHostSource('client-factory', capturedId, () => factory?.version),
    createClient: readHostSource('client-factory', capturedId, () => factory?.createClient),
    policiesAreArray,
    allowedExposePolicies: policies === undefined
      ? undefined
      : policiesAreArray
        ? readHostSource('client-factory', capturedId, () => Array.from(policies))
        : [],
    defaultExposePolicy: readHostSource('client-factory', capturedId, () => factory?.defaultExposePolicy),
  }
}

/** Captures and normalizes one Host descriptor. Throws `invalid-host-source` for an invalid payload. */
export function captureHostDescriptor(input: unknown): KitDescriptorSnapshot {
  return normalizeHostDescriptor(captureHostDescriptorInput(input))
}

/** Captures and normalizes one Host Client factory. Throws `invalid-host-source` for an invalid payload. */
export function captureHostClientFactory<TClient>(input: unknown): KitRef<TClient> {
  return normalizeHostClientFactory<TClient>(captureHostClientFactoryInput(input))
}

/**
 * Captures one Kit contract that a plugin provides. The result has no references to caller-owned objects.
 * Throws `invalid-kit-contract` for an invalid contract.
 */
export function captureProvidedContract<TContract extends KitContract>(contract: TContract, owner: KitCaptureOwner): AcceptedKitContract {
  let captured: ReturnType<typeof captureKitContractInput>
  try {
    captured = captureKitContractInput(contract)
  }
  catch (error) {
    if (error instanceof KitContractCaptureError)
      throw new KitProviderRegistrationError('invalid-kit-contract', error.kitId, owner.extensionId, owner.sessionId)
    throw error
  }

  let normalized: KitContract
  try {
    normalized = normalizeKitContractInput(captured)
  }
  catch (error) {
    if (error instanceof KitContractInputError) {
      const contractId = typeof captured.id === 'string' ? captured.id : ''
      throw new KitProviderRegistrationError('invalid-kit-contract', contractId, owner.extensionId, owner.sessionId)
    }
    throw error
  }
  return Object.freeze({
    contract: normalized,
    methodNames: Object.freeze(Object.keys(normalized.methods)),
    eventNames: Object.freeze(Object.keys(normalized.events)),
  })
}

/**
 * Captures the method handlers of one provider. Each contract method must have exactly one handler.
 * Throws `invalid-kit-provider` for a missing, extra, or invalid handler.
 */
export function captureProviderEndpoint<TContract extends KitContract>(
  acceptedContract: AcceptedKitContract,
  provider: KitProvider<TContract>,
  owner: KitCaptureOwner,
): AcceptedProviderEndpoint {
  const contract = acceptedContract.contract
  const invalidProvider = () => new KitProviderRegistrationError('invalid-kit-provider', contract.id, owner.extensionId, owner.sessionId)
  const capture = <T>(read: () => T): T => {
    try {
      return read()
    }
    catch {
      throw invalidProvider()
    }
  }
  const methods = capture(() => provider?.methods)
  const methodsAreArray = capture(() => Array.isArray(methods))
  if (!methods || typeof methods !== 'object' || methodsAreArray)
    throw invalidProvider()

  const capturedMethods: CapturedProviderMethod[] = []
  const methodNames = capture(() => Reflect.ownKeys(methods))
  for (const name of methodNames) {
    const descriptor = capture(() => Object.getOwnPropertyDescriptor(methods, name))
    capturedMethods.push({
      name,
      enumerable: descriptor?.enumerable === true,
      handler: capture(() => Reflect.get(methods, name)),
    })
  }

  const expectedNames = new Set(acceptedContract.methodNames)
  if (capturedMethods.length !== expectedNames.size
    || capturedMethods.some(method => typeof method.name !== 'string'
      || !method.enumerable
      || !expectedNames.has(method.name)
      || typeof method.handler !== 'function')) {
    throw invalidProvider()
  }

  // Object.fromEntries keeps `__proto__` as an own data property.
  const handlers = Object.fromEntries(capturedMethods.map(method => [method.name, method.handler]))
  return Object.freeze({ methods: Object.freeze(handlers) })
}
