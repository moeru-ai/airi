import type { HostClientFactory, KitContract, KitProvider, KitProviderHandle, KitRef } from '../kit'
import type { HostSourceKind, HostSourceLease } from './shared/host-sources'
import type { KitDescriptor, KitDescriptorSnapshot } from './shared/kits'
import type { ExtensionProvidedKitDeclaration, PluginRuntime } from './shared/types'

import { safeParse } from 'valibot'

import {
  captureKitContractInput,
  KitContractCaptureError,
  KitContractInputError,
  normalizeKitContractInput,
} from '../kit/contract'
import { isExactSemanticVersion } from '../kit/exact-semantic-version'
import { exposePolicySchema } from '../kit/exposure-policy'
import { normalizeExposurePolicyOptions } from '../kit/exposure-policy-options'
import { kitDescriptorSchema } from './shared/kits'

/** A Provider session, distinct from the Extension's persisted enabled intent. */
export interface ExtensionKitProviderOwner {
  /** Selects session ownership instead of Host ownership. */
  readonly kind: 'extension'
  /** Extension that owns the registration. */
  readonly extensionId: string
  /** Exact Extension session that owns the registration. */
  readonly sessionId: string
}

/** Owner of a ready Provider registration. */
export type KitProviderOwner = ExtensionKitProviderOwner | { readonly kind: 'host' }

/** Input that reserves all Provider declarations for one Extension setup. */
export interface ExtensionProviderSessionInput {
  /** Owner used for rollback, stop, and reload. */
  owner: ExtensionKitProviderOwner
  /** Complete declaration set that the setup transaction must fill. */
  declarations: readonly ExtensionProvidedKitDeclaration[]
}

/** Public metadata only. Provider handlers stay private to the current session. */
export interface ReadyKitProviderSnapshot {
  /** Stable Kit identifier. */
  readonly id: string
  /** Exact Provider version. */
  readonly version: string
  /** Exposure policy declared by an Extension Provider. */
  readonly exposure?: ExtensionProvidedKitDeclaration['exposure']
  /** Monotonic publication number for this Kit identifier. */
  readonly generation: number
  /** Host or Extension session that owns this generation. */
  readonly owner: KitProviderOwner
}

/**
 * Host registration payloads share identity and lifecycle, but keep source-specific data.
 *
 * @param TClient Client type returned by a Host factory.
 */
export type HostKitSource<TClient = unknown>
  = | {
    readonly kind: 'descriptor'
    readonly descriptor: KitDescriptor
  }
  | {
    readonly kind: 'client-factory'
    readonly factory: KitRef<TClient>
  }

type AcceptedHostSource<TClient = unknown>
  = | {
    readonly kind: 'descriptor'
    readonly accepted: KitDescriptorSnapshot
  }
  | {
    readonly kind: 'client-factory'
    readonly accepted: KitRef<TClient>
  }

export type { HostSourceLease } from './shared/host-sources'

/** Withdraws all Provider registrations published by one Extension setup commit. */
export interface ExtensionRegistrationLease {
  /** Exact Extension session that owns the registrations. */
  readonly owner: ExtensionKitProviderOwner
  /** Point-in-time snapshots published by the commit. */
  readonly providers: readonly ReadyKitProviderSnapshot[]
  /** Withdraws current registrations from this commit. Returns true when at least one registration changed. */
  dispose: () => boolean
}

/** Stable code for a Provider registration failure. */
export type KitProviderRegistrationErrorCode
  = | 'provider-slot-conflict'
    | 'invalid-host-source'
    | 'invalid-provider-session'
    | 'undeclared-kit'
    | 'kit-version-mismatch'
    | 'kit-exposure-mismatch'
    | 'duplicate-provide'
    | 'invalid-kit-contract'
    | 'invalid-kit-provider'
    | 'missing-declared-kit'
    | 'stale-provider-transaction'

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

interface Tokenized<T> {
  readonly token: symbol
  readonly payload: T
}

interface HostReadySlot {
  readonly state: 'host-ready'
  readonly id: string
  readonly version: string
  readonly generation: number
  readonly sources: {
    readonly descriptor?: Tokenized<KitDescriptorSnapshot>
    readonly clientFactory?: Tokenized<KitRef<unknown>>
  }
}

interface AcceptedKitContract {
  readonly contract: KitContract
  readonly methodNames: readonly string[]
  readonly eventNames: readonly string[]
}

type PendingProviderState
  = | { readonly state: 'unfilled' }
    | {
      readonly state: 'filled'
      readonly registrationToken: symbol
      readonly contract: AcceptedKitContract
      readonly endpoint: AcceptedProviderEndpoint
    }
    | { readonly state: 'withdrawn' }

interface ExtensionPendingSlot {
  readonly state: 'extension-pending'
  readonly declaration: ExtensionProvidedKitDeclaration
  readonly owner: ExtensionKitProviderOwner
  readonly transactionToken: symbol
  readonly provider: PendingProviderState
}

interface ExtensionReadySlot {
  readonly state: 'extension-ready'
  readonly id: string
  readonly version: string
  readonly generation: number
  readonly exposure: ExtensionProvidedKitDeclaration['exposure']
  readonly owner: ExtensionKitProviderOwner
  readonly registrationToken: symbol
  readonly contract: AcceptedKitContract
  readonly endpoint: AcceptedProviderEndpoint
}

type KitSlot = HostReadySlot | ExtensionPendingSlot | ExtensionReadySlot

interface AcceptedProviderEndpoint {
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

interface TransactionState {
  readonly owner: ExtensionKitProviderOwner
  readonly kitIds: readonly string[]
  readonly token: symbol
  phase: 'pending' | 'committed' | 'rolled-back'
}

interface PreparedExtensionPublication {
  readonly id: string
  readonly generation: number
  readonly readySlot: ExtensionReadySlot
  readonly registrationToken: symbol
  readonly snapshot: ReadyKitProviderSnapshot
}

interface ProviderSessionCaptureContext {
  extensionId?: string
  sessionId?: string
  kitId: string
}

/** Result of one successful Extension Provider commit. */
export interface ExtensionProviderCommit {
  /** Immutable Provider snapshots published by this commit. */
  readonly providers: readonly ReadyKitProviderSnapshot[]
  /** Exact-session ownership for cleanup. */
  readonly lease: ExtensionRegistrationLease
}

/** One setup transaction reserves all declared slots before Extension code runs. */
export interface ExtensionProviderTransaction {
  /** Fills one reserved declaration with its Contract and handlers. */
  provide: <TContract extends KitContract>(contract: TContract, provider: KitProvider<TContract>) => KitProviderHandle
  /** Publishes all filled declarations as one ready generation. */
  commit: () => ExtensionProviderCommit
  /** Releases every pending reservation without publishing a generation. */
  rollback: () => void
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

function invalidProviderSessionInput(context: ProviderSessionCaptureContext): KitProviderRegistrationError {
  return new KitProviderRegistrationError(
    'invalid-provider-session',
    context.kitId,
    context.extensionId,
    context.sessionId,
  )
}

function readProviderSessionInput<T>(context: ProviderSessionCaptureContext, read: () => T): T {
  try {
    return read()
  }
  catch {
    throw invalidProviderSessionInput(context)
  }
}

/**
 * Captures and normalizes one Extension Provider session before reservation.
 *
 * @example
 * captureExtensionProviderSessionInput({
 *   owner: { kind: 'extension', extensionId: 'example', sessionId: 'session-1' },
 *   declarations: [],
 * })
 * // => { owner: { kind: 'extension', extensionId: 'example', sessionId: 'session-1' }, declarations: [] }
 */
function captureExtensionProviderSessionInput(input: unknown): {
  readonly owner: ExtensionKitProviderOwner
  readonly declarations: readonly ExtensionProvidedKitDeclaration[]
} {
  const context: ProviderSessionCaptureContext = { kitId: '' }
  if (input === null || typeof input !== 'object') {
    throw invalidProviderSessionInput(context)
  }

  const ownerInput = readProviderSessionInput(context, () => Reflect.get(input, 'owner'))
  if (ownerInput === null || typeof ownerInput !== 'object') {
    throw invalidProviderSessionInput(context)
  }
  const kind = readProviderSessionInput(context, () => Reflect.get(ownerInput, 'kind'))
  const extensionIdInput = readProviderSessionInput(context, () => Reflect.get(ownerInput, 'extensionId'))
  context.extensionId = typeof extensionIdInput === 'string' ? extensionIdInput : undefined
  const sessionIdInput = readProviderSessionInput(context, () => Reflect.get(ownerInput, 'sessionId'))
  context.sessionId = typeof sessionIdInput === 'string' ? sessionIdInput : undefined
  if (kind !== 'extension' || !context.extensionId?.trim() || !context.sessionId?.trim()) {
    throw invalidProviderSessionInput(context)
  }
  const owner: ExtensionKitProviderOwner = Object.freeze({
    kind,
    extensionId: context.extensionId,
    sessionId: context.sessionId,
  })

  const declarationsInput = readProviderSessionInput(context, () => Reflect.get(input, 'declarations'))
  const declarationsAreArray = readProviderSessionInput(context, () => Array.isArray(declarationsInput))
  if (!declarationsAreArray) {
    throw invalidProviderSessionInput(context)
  }
  const declarationInputs = readProviderSessionInput(context, () => Array.from(declarationsInput as readonly unknown[]))
  const declarations: ExtensionProvidedKitDeclaration[] = []
  for (const declarationInput of declarationInputs) {
    context.kitId = ''
    if (declarationInput === null || typeof declarationInput !== 'object') {
      throw invalidProviderSessionInput(context)
    }
    const idInput = readProviderSessionInput(context, () => Reflect.get(declarationInput, 'id'))
    context.kitId = typeof idInput === 'string' ? idInput : ''
    const versionInput = readProviderSessionInput(context, () => Reflect.get(declarationInput, 'version'))
    const exposureInput = readProviderSessionInput(context, () => Reflect.get(declarationInput, 'exposure'))
    const exposureResult = safeParse(exposePolicySchema, exposureInput)
    if (!context.kitId || context.kitId.trim() !== context.kitId
      || typeof versionInput !== 'string' || !isExactSemanticVersion(versionInput)
      || !exposureResult.success) {
      throw invalidProviderSessionInput(context)
    }
    declarations.push(Object.freeze({
      id: context.kitId,
      version: versionInput,
      exposure: exposureResult.output,
    }))
  }

  return Object.freeze({ owner, declarations: Object.freeze(declarations) })
}

/**
 * Owns Provider identity, registration transactions, and generation assignment.
 *
 * One Kit ID has one active slot. Host sources share one Host slot, while
 * Extension pending and ready states use distinct slot variants. Every visible
 * Host aggregate change creates a generation. Exact-source leases prevent stale
 * cleanup from withdrawing replacement registrations.
 */
export class KitProviderRegistry {
  private readonly slots = new Map<string, KitSlot>()
  private readonly transactions = new Map<string, TransactionState>()
  private readonly lastGenerations = new Map<string, number>()

  private nextGeneration(id: string) {
    const generation = this.getNextGeneration(id)
    this.lastGenerations.set(id, generation)
    return generation
  }

  private getNextGeneration(id: string) {
    return (this.lastGenerations.get(id) ?? 0) + 1
  }

  /** Registers one Host source and returns exact ownership for its lifecycle. */
  contributeHost(source: Extract<HostKitSource, { kind: 'descriptor' }>): HostSourceLease<KitDescriptorSnapshot>
  contributeHost<TClient>(source: Extract<HostKitSource<TClient>, { kind: 'client-factory' }>): HostSourceLease<KitRef<TClient>>
  contributeHost<TClient>(source: HostKitSource<TClient>): HostSourceLease<KitDescriptorSnapshot | KitRef<TClient>> {
    const sourceKind = readHostSource(undefined, '', () => source?.kind)

    if (sourceKind === 'descriptor') {
      const input = readHostSource('descriptor', '', () => (source as Extract<HostKitSource, { kind: 'descriptor' }>).descriptor)
      const accepted = normalizeHostDescriptor(captureHostDescriptorInput(input))
      return this.publishHostSource({ kind: 'descriptor', accepted })
    }

    if (sourceKind !== 'client-factory') {
      throw invalidHostSource(undefined, '')
    }

    const input = readHostSource('client-factory', '', () => (source as Extract<HostKitSource<TClient>, { kind: 'client-factory' }>).factory)
    const accepted = normalizeHostClientFactory<TClient>(captureHostClientFactoryInput(input))
    return this.publishHostSource({ kind: 'client-factory', accepted })
  }

  private getHostSlotForContribution(id: string, version: string, sourceKind: HostSourceKind): HostReadySlot | undefined {
    const current = this.slots.get(id)
    if (!current) {
      return undefined
    }
    if (current.state !== 'host-ready' || current.version !== version) {
      throw new KitProviderRegistrationError('provider-slot-conflict', id, undefined, undefined, { sourceKind })
    }
    const duplicate = sourceKind === 'descriptor'
      ? current.sources.descriptor
      : current.sources.clientFactory
    if (duplicate) {
      throw new KitProviderRegistrationError('provider-slot-conflict', id, undefined, undefined, { sourceKind })
    }
    return current
  }

  private publishHostSource(source: Extract<AcceptedHostSource, { kind: 'descriptor' }>): HostSourceLease<KitDescriptorSnapshot>
  private publishHostSource<TClient>(source: Extract<AcceptedHostSource<TClient>, { kind: 'client-factory' }>): HostSourceLease<KitRef<TClient>>
  private publishHostSource<TClient>(source: AcceptedHostSource<TClient>): HostSourceLease<KitDescriptorSnapshot | KitRef<TClient>> {
    const id = source.kind === 'descriptor' ? source.accepted.kitId : source.accepted.id
    const version = source.accepted.version
    const current = this.getHostSlotForContribution(id, version, source.kind)
    const token = Symbol(id)
    const sources: HostReadySlot['sources'] = source.kind === 'descriptor'
      ? {
          descriptor: { token, payload: source.accepted },
          clientFactory: current?.sources.clientFactory,
        }
      : {
          descriptor: current?.sources.descriptor,
          clientFactory: { token, payload: source.accepted },
        }
    this.slots.set(id, {
      state: 'host-ready',
      id,
      version,
      generation: this.nextGeneration(id),
      sources,
    })
    return Object.freeze({
      accepted: source.accepted,
      kitId: id,
      sourceKind: source.kind,
      dispose: () => this.withdrawHostSource(id, source.kind, token),
    })
  }

  private withdrawHostSource(id: string, sourceKind: HostSourceKind, token: symbol): boolean {
    const current = this.slots.get(id)
    if (current?.state !== 'host-ready') {
      return false
    }
    const registered = sourceKind === 'descriptor'
      ? current.sources.descriptor
      : current.sources.clientFactory
    if (registered?.token !== token) {
      return false
    }

    const descriptor = sourceKind === 'descriptor' ? undefined : current.sources.descriptor
    const clientFactory = sourceKind === 'client-factory' ? undefined : current.sources.clientFactory
    if (!descriptor && !clientFactory) {
      this.slots.delete(id)
      return true
    }

    this.slots.set(id, {
      ...current,
      generation: this.nextGeneration(id),
      sources: { descriptor, clientFactory },
    })
    return true
  }

  /** Returns the immutable Host descriptor accepted for one Kit. */
  getHostDescriptor(id: string): KitDescriptorSnapshot | undefined {
    const slot = this.slots.get(id)
    return slot?.state === 'host-ready' ? slot.sources.descriptor?.payload : undefined
  }

  /** Returns immutable Host descriptors, optionally filtered by runtime. */
  listHostDescriptors(runtime?: PluginRuntime): readonly KitDescriptorSnapshot[] {
    return Object.freeze([...this.slots.values()]
      .filter((slot): slot is HostReadySlot => slot.state === 'host-ready')
      .flatMap((slot) => {
        const descriptor = slot.sources.descriptor?.payload
        return descriptor && (!runtime || descriptor.runtimes.includes(runtime)) ? [descriptor] : []
      }))
  }

  /** Returns the receiver-free Host Client factory for one Kit. */
  getHostClientFactory<TClient>(id: string): HostClientFactory<TClient> | undefined {
    const slot = this.slots.get(id)
    if (slot?.state !== 'host-ready') {
      return undefined
    }
    return slot.sources.clientFactory?.payload.createClient as HostClientFactory<TClient> | undefined
  }

  /** Reserves all declarations for one Extension setup transaction. */
  beginExtensionSession(input: ExtensionProviderSessionInput): ExtensionProviderTransaction {
    const { owner, declarations } = captureExtensionProviderSessionInput(input)
    if (this.transactions.has(owner.sessionId)) {
      throw new KitProviderRegistrationError('stale-provider-transaction', '', owner.extensionId, owner.sessionId)
    }

    const ids = new Set<string>()
    for (const declaration of declarations) {
      if (ids.has(declaration.id) || this.slots.has(declaration.id)) {
        throw new KitProviderRegistrationError('provider-slot-conflict', declaration.id, owner.extensionId, owner.sessionId)
      }
      ids.add(declaration.id)
    }

    const transaction: TransactionState = {
      owner,
      kitIds: Object.freeze([...ids]),
      token: Symbol(owner.sessionId),
      phase: 'pending',
    }
    for (const declaration of declarations) {
      this.slots.set(declaration.id, {
        state: 'extension-pending',
        declaration,
        owner,
        transactionToken: transaction.token,
        provider: { state: 'unfilled' },
      })
    }
    this.transactions.set(owner.sessionId, transaction)

    return {
      provide: <TContract extends KitContract>(contract: TContract, provider: KitProvider<TContract>) => {
        const acceptedContract = this.captureContract(contract, owner)
        const normalized = acceptedContract.contract
        const slot = this.getCurrentPendingSlot(transaction, normalized.id)
        if (slot.provider.state !== 'unfilled') {
          throw new KitProviderRegistrationError('duplicate-provide', normalized.id, owner.extensionId, owner.sessionId)
        }
        if (normalized.version !== slot.declaration.version) {
          throw new KitProviderRegistrationError('kit-version-mismatch', normalized.id, owner.extensionId, owner.sessionId)
        }
        if (!normalized.allowedExposePolicies?.includes(slot.declaration.exposure)) {
          throw new KitProviderRegistrationError('kit-exposure-mismatch', normalized.id, owner.extensionId, owner.sessionId)
        }

        const endpoint = this.captureProviderEndpoint(acceptedContract, provider, owner)
        const registrationToken = Symbol(normalized.id)
        this.slots.set(normalized.id, {
          ...slot,
          provider: { state: 'filled', registrationToken, contract: acceptedContract, endpoint },
        })
        return {
          dispose: () => {
            this.withdrawProviderToken(normalized.id, registrationToken)
          },
        }
      },
      commit: () => this.commitTransaction(transaction),
      rollback: () => this.rollbackTransaction(transaction),
    }
  }

  private captureContract<TContract extends KitContract>(contract: TContract, owner: ExtensionKitProviderOwner): AcceptedKitContract {
    let captured: ReturnType<typeof captureKitContractInput>
    try {
      captured = captureKitContractInput(contract)
    }
    catch (error) {
      if (error instanceof KitContractCaptureError) {
        throw new KitProviderRegistrationError('invalid-kit-contract', error.kitId, owner.extensionId, owner.sessionId)
      }
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

  private captureProviderEndpoint<TContract extends KitContract>(
    acceptedContract: AcceptedKitContract,
    provider: KitProvider<TContract>,
    owner: ExtensionKitProviderOwner,
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
    if (!methods || typeof methods !== 'object' || methodsAreArray) {
      throw invalidProvider()
    }

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

  private commitTransaction(transaction: TransactionState): ExtensionProviderCommit {
    this.assertTransactionCurrent(transaction)
    const publications: PreparedExtensionPublication[] = []
    for (const id of transaction.kitIds) {
      const slot = this.getCurrentPendingSlot(transaction, id)
      if (slot.provider.state !== 'filled') {
        throw new KitProviderRegistrationError('missing-declared-kit', id, transaction.owner.extensionId, transaction.owner.sessionId)
      }
      const provider = slot.provider
      const generation = this.getNextGeneration(slot.declaration.id)
      const snapshot = this.createSnapshot({
        id: slot.declaration.id,
        version: slot.declaration.version,
        exposure: slot.declaration.exposure,
        generation,
        owner: transaction.owner,
      })
      const readySlot: ExtensionReadySlot = Object.freeze({
        state: 'extension-ready',
        id: snapshot.id,
        version: snapshot.version,
        generation: snapshot.generation,
        exposure: slot.declaration.exposure,
        owner: transaction.owner,
        registrationToken: provider.registrationToken,
        contract: provider.contract,
        endpoint: provider.endpoint,
      })
      publications.push(Object.freeze({
        id: snapshot.id,
        generation,
        readySlot,
        registrationToken: provider.registrationToken,
        snapshot,
      }))
    }

    const providers = Object.freeze(publications.map(publication => publication.snapshot))
    const registrations = Object.freeze(publications.map(publication => Object.freeze({
      id: publication.id,
      token: publication.registrationToken,
    })))
    const lease: ExtensionRegistrationLease = Object.freeze({
      owner: transaction.owner,
      providers,
      dispose: () => registrations.reduce(
        (changed, registration) => this.withdrawProviderToken(registration.id, registration.token) || changed,
        false,
      ),
    })
    const commit = Object.freeze({ providers, lease })

    for (const publication of publications) {
      this.lastGenerations.set(publication.id, publication.generation)
      this.slots.set(publication.id, publication.readySlot)
    }
    transaction.phase = 'committed'
    this.transactions.delete(transaction.owner.sessionId)
    return commit
  }

  private rollbackTransaction(transaction: TransactionState): void {
    if (transaction.phase !== 'pending' || this.transactions.get(transaction.owner.sessionId) !== transaction) {
      return
    }
    transaction.phase = 'rolled-back'
    for (const id of transaction.kitIds) {
      const slot = this.slots.get(id)
      if (slot?.state === 'extension-pending' && slot.transactionToken === transaction.token) {
        this.slots.delete(id)
      }
    }
    this.transactions.delete(transaction.owner.sessionId)
  }

  private assertTransactionCurrent(transaction: TransactionState): void {
    if (transaction.phase !== 'pending' || this.transactions.get(transaction.owner.sessionId) !== transaction) {
      throw new KitProviderRegistrationError('stale-provider-transaction', '', transaction.owner.extensionId, transaction.owner.sessionId)
    }
  }

  private getCurrentPendingSlot(transaction: TransactionState, id: string): ExtensionPendingSlot {
    this.assertTransactionCurrent(transaction)
    const slot = this.slots.get(id)
    if (slot?.state !== 'extension-pending' || slot.transactionToken !== transaction.token) {
      const declared = transaction.kitIds.includes(id)
      const code = declared ? 'stale-provider-transaction' : 'undeclared-kit'
      throw new KitProviderRegistrationError(code, id, transaction.owner.extensionId, transaction.owner.sessionId)
    }
    return slot
  }

  private withdrawProviderToken(id: string, token: symbol): boolean {
    const slot = this.slots.get(id)
    if (slot?.state === 'extension-pending' && slot.provider.state === 'filled' && slot.provider.registrationToken === token) {
      this.slots.set(id, { ...slot, provider: { state: 'withdrawn' } })
      return true
    }
    if (slot?.state === 'extension-ready' && slot.registrationToken === token) {
      this.slots.delete(id)
      return true
    }
    return false
  }

  private createSnapshot(snapshot: ReadyKitProviderSnapshot): ReadyKitProviderSnapshot {
    return Object.freeze({ ...snapshot, owner: Object.freeze({ ...snapshot.owner }) })
  }

  /** Returns an immutable point-in-time snapshot. Re-query after stop or reload to check the current generation. */
  getReady(id: string): ReadyKitProviderSnapshot | undefined {
    const slot = this.slots.get(id)
    if (slot?.state === 'host-ready') {
      return this.createSnapshot({ id, version: slot.version, generation: slot.generation, owner: { kind: 'host' } })
    }
    if (slot?.state === 'extension-ready') {
      return this.createSnapshot({
        id,
        version: slot.version,
        exposure: slot.exposure,
        generation: slot.generation,
        owner: slot.owner,
      })
    }
    return undefined
  }

  /** Returns an immutable point-in-time list. Re-query after stop or reload to check current generations. */
  listReady(): readonly ReadyKitProviderSnapshot[] {
    return Object.freeze([...this.slots.keys()]
      .sort()
      .flatMap((id) => {
        const snapshot = this.getReady(id)
        return snapshot ? [snapshot] : []
      }))
  }
}
