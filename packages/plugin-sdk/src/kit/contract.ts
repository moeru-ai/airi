import type { Disposable } from '../extension/disposable'
import type { ExposePolicy } from './exposure-policy'

import { isExactSemanticVersion } from './exact-semantic-version'
import { normalizeExposurePolicyOptions } from './exposure-policy-options'

export type { ExposePolicy } from './exposure-policy'

declare const methodInput: unique symbol
declare const methodOutput: unique symbol
declare const eventPayload: unique symbol

/** Data allowed across a future Kit method or event route. */
export type KitValue = boolean | null | number | string | KitValue[] | { [key: string]: KitValue }

type KitPrimitive = boolean | null | number | string
type IsAny<T> = 0 extends (1 & T) ? true : false
type IsKitValue<T> = IsAny<T> extends true
  ? false
  : [T] extends [KitValue]
      ? true
      : T extends KitPrimitive
        ? true
        : T extends (...args: never[]) => unknown
          ? false
          : T extends unknown[]
            ? false extends IsKitValue<T[number]> ? false : true
            : T extends object
              ? keyof T extends never
                ? false
                : false extends { [K in keyof T]-?: IsKitValue<T[K]> }[keyof T] ? false : true
              : false

type MethodArguments<TInput, TOutput> = [TInput] extends [undefined]
  ? IsKitValue<TOutput> extends true ? [] : [error: 'Kit method output must be a KitValue']
  : IsKitValue<TInput> extends true
    ? IsKitValue<TOutput> extends true ? [] : [error: 'Kit method output must be a KitValue']
    : [error: 'Kit method input must be a KitValue or undefined']

type EventArguments<TPayload> = IsKitValue<TPayload> extends true
  ? []
  : [error: 'Kit event payload must be a KitValue']

/**
 * A typed method declaration. Phase 3 stores its handler but does not call it.
 *
 * @param TInput Input value for the method.
 * @param TOutput Output value from the method.
 */
export interface KitMethodContract<TInput = KitValue | undefined, TOutput = KitValue> {
  readonly kind: 'method'
  readonly [methodInput]?: TInput
  readonly [methodOutput]?: TOutput
}

/**
 * A typed event declaration. Phase 4 will add event routing.
 *
 * @param TPayload Payload for the event.
 */
export interface KitEventContract<TPayload = KitValue> {
  readonly kind: 'event'
  readonly [eventPayload]?: TPayload
}

/** Method declarations indexed by their Contract names. */
export type KitMethodMap = Readonly<Record<string, KitMethodContract<unknown, unknown>>>

/** Event declarations indexed by their Contract names. */
export type KitEventMap = Readonly<Record<string, KitEventContract<unknown>>>

/**
 * Defines one method of an Extension-hosted Kit.
 *
 * @template TInput Input value for the method.
 * @template TOutput Output value from the method.
 */
export function defineKitMethod<TInput, TOutput>(...validation: MethodArguments<TInput, TOutput>): KitMethodContract<TInput, TOutput> {
  void validation
  return Object.freeze({ kind: 'method' })
}

/**
 * Defines one event of an Extension-hosted Kit.
 *
 * @template TPayload Payload for the event.
 */
export function defineKitEvent<TPayload>(...validation: EventArguments<TPayload>): KitEventContract<TPayload> {
  void validation
  return Object.freeze({ kind: 'event' })
}

/**
 * Shared identity and members of an Extension-hosted Kit. No Client object crosses this Interface.
 *
 * @param TMethods Method declarations in this Kit.
 * @param TEvents Event declarations in this Kit.
 */
export interface KitContract<TMethods extends KitMethodMap = KitMethodMap, TEvents extends KitEventMap = KitEventMap> {
  /** Stable Kit identifier. */
  readonly id: string
  /** Exact semantic version for this Contract. */
  readonly version: string
  /** Frozen method declarations. */
  readonly methods: Readonly<TMethods>
  /** Frozen event declarations. */
  readonly events: Readonly<TEvents>
  /** Exposure policies accepted by this Contract. @default ['local-only'] */
  readonly allowedExposePolicies?: readonly ExposePolicy[]
  /** Exposure policy selected when the caller does not select one. */
  readonly defaultExposePolicy?: ExposePolicy
}

type MethodInput<T> = T extends KitMethodContract<infer I, unknown> ? I : never
type MethodOutput<T> = T extends KitMethodContract<unknown, infer O> ? O : never

/** Consumer identity supplied to a method handler by the Phase 4 Router. */
export interface KitCallContext {
  /** Extension that consumes the Provider. */
  consumerExtensionId: string
  /** Extension session that consumes the Provider. */
  consumerSessionId: string
  /** Module that consumes the Provider, when the call has module scope. */
  consumerModuleId?: string
}

/**
 * A Provider implements every method named by its Contract.
 *
 * @param TContract Contract implemented by the Provider.
 */
export interface KitProvider<TContract extends KitContract> {
  methods: {
    [K in keyof TContract['methods']]: (
      input: MethodInput<TContract['methods'][K]>,
      context: KitCallContext,
    ) => MethodOutput<TContract['methods'][K]> | Promise<MethodOutput<TContract['methods'][K]>>
  }
}

/** Withdraws this exact registration. Stale handles cannot withdraw a replacement. */
export interface KitProviderHandle extends Disposable {}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

interface CapturedKitContractMember {
  readonly name: PropertyKey
  readonly enumerable: boolean
  readonly declarationIsPlainRecord: boolean
  readonly kind: unknown
}

interface CapturedKitContractMemberMap {
  readonly isPlainRecord: boolean
  readonly members: readonly CapturedKitContractMember[]
}

/** Values that the Contract capture step reads from caller-owned input. */
export interface CapturedKitContractInput {
  readonly inputIsObject: boolean
  readonly id: unknown
  readonly version: unknown
  readonly methods: CapturedKitContractMemberMap
  readonly events: CapturedKitContractMemberMap
  readonly policiesAreArray: boolean
  readonly allowedExposePolicies?: readonly unknown[]
  readonly defaultExposePolicy: unknown
}

/** Reports an external property read that failed during Contract capture. */
export class KitContractCaptureError extends Error {
  constructor(readonly kitId: string) {
    super(`Kit contract input is unavailable: ${kitId}`)
    this.name = 'KitContractCaptureError'
  }
}

/** Reports a Contract value that does not match the authoring contract. */
export class KitContractInputError extends TypeError {
  constructor(message: string) {
    super(message)
    this.name = 'KitContractInputError'
  }
}

function readContractInput<T>(kitId: string, read: () => T): T {
  try {
    return read()
  }
  catch {
    throw new KitContractCaptureError(kitId)
  }
}

function captureMemberMap(input: unknown, kitId: string): CapturedKitContractMemberMap {
  const inputIsPlainRecord = readContractInput(kitId, () => isPlainRecord(input))
  if (!inputIsPlainRecord) {
    return { isPlainRecord: false, members: [] }
  }

  const memberMap = input as Record<PropertyKey, unknown>
  const names = readContractInput(kitId, () => Reflect.ownKeys(memberMap))
  const members: CapturedKitContractMember[] = []
  for (const name of names) {
    const descriptor = readContractInput(kitId, () => Object.getOwnPropertyDescriptor(memberMap, name))
    const declaration = readContractInput(kitId, () => Reflect.get(memberMap, name))
    const declarationIsPlainRecord = readContractInput(kitId, () => isPlainRecord(declaration))
    const kind = declarationIsPlainRecord
      ? readContractInput(kitId, () => Reflect.get(declaration as Record<PropertyKey, unknown>, 'kind'))
      : undefined
    members.push({
      name,
      enumerable: descriptor?.enumerable === true,
      declarationIsPlainRecord,
      kind,
    })
  }
  return { isPlainRecord: true, members }
}

/**
 * Captures caller-owned Contract properties once.
 *
 * The returned value has no references to caller-owned declaration objects.
 */
export function captureKitContractInput(input: unknown): CapturedKitContractInput {
  if (input === null || typeof input !== 'object') {
    return {
      inputIsObject: false,
      id: undefined,
      version: undefined,
      methods: { isPlainRecord: false, members: [] },
      events: { isPlainRecord: false, members: [] },
      policiesAreArray: false,
      defaultExposePolicy: undefined,
    }
  }

  const id = readContractInput('', () => Reflect.get(input, 'id'))
  const kitId = typeof id === 'string' ? id : ''
  const version = readContractInput(kitId, () => Reflect.get(input, 'version'))
  const methodsInput = readContractInput(kitId, () => Reflect.get(input, 'methods'))
  const eventsInput = readContractInput(kitId, () => Reflect.get(input, 'events'))
  const policiesInput = readContractInput(kitId, () => Reflect.get(input, 'allowedExposePolicies'))
  const policiesAreArray = policiesInput === undefined
    || readContractInput(kitId, () => Array.isArray(policiesInput))
  const allowedExposePolicies = policiesInput === undefined
    ? undefined
    : policiesAreArray
      ? readContractInput(kitId, () => Array.from(policiesInput as readonly unknown[]))
      : []

  return {
    inputIsObject: true,
    id,
    version,
    methods: captureMemberMap(methodsInput, kitId),
    events: captureMemberMap(eventsInput, kitId),
    policiesAreArray,
    allowedExposePolicies,
    defaultExposePolicy: readContractInput(kitId, () => Reflect.get(input, 'defaultExposePolicy')),
  }
}

function invalidContract(message: string): never {
  throw new KitContractInputError(message)
}

function createCanonicalMemberMap(
  input: CapturedKitContractMemberMap,
  expectedKind: 'method',
  kitId: string,
  blockedNames: ReadonlySet<string>,
): KitMethodMap
function createCanonicalMemberMap(
  input: CapturedKitContractMemberMap,
  expectedKind: 'event',
  kitId: string,
  blockedNames: ReadonlySet<string>,
): KitEventMap
function createCanonicalMemberMap(
  input: CapturedKitContractMemberMap,
  expectedKind: 'event' | 'method',
  kitId: string,
  blockedNames: ReadonlySet<string>,
): Readonly<Record<string, KitEventContract<unknown> | KitMethodContract<unknown, unknown>>> {
  if (!input.isPlainRecord) {
    invalidContract(`Kit contract \`${kitId}\` methods and events must be plain objects.`)
  }

  const members = Object.create(null) as Record<string, KitEventContract<unknown> | KitMethodContract<unknown, unknown>>
  for (const member of input.members) {
    const name = typeof member.name === 'string' ? member.name : ''
    if (!name
      || typeof member.name === 'symbol'
      || !member.enumerable
      || blockedNames.has(name)
      || !member.declarationIsPlainRecord
      || member.kind !== expectedKind) {
      invalidContract(`Kit contract \`${kitId}\` has an invalid ${expectedKind} \`${String(member.name)}\`.`)
    }
    Object.defineProperty(members, name, {
      enumerable: true,
      value: Object.freeze({ kind: expectedKind }),
    })
  }
  return Object.freeze(members)
}

/**
 * Normalizes captured Contract values.
 *
 * @example
 * normalizeKitContractInput(captureKitContractInput({ id: 'kit.example', version: '1.0.0', methods: {}, events: {} }))
 * // => { id: 'kit.example', version: '1.0.0', methods: {}, events: {}, allowedExposePolicies: ['local-only'] }
 */
export function normalizeKitContractInput(input: CapturedKitContractInput): KitContract {
  const id = typeof input.id === 'string' ? input.id : ''
  if (!input.inputIsObject || !id.trim()) {
    invalidContract('Kit contract id must be a non-empty string.')
  }
  if (typeof input.version !== 'string' || !isExactSemanticVersion(input.version)) {
    invalidContract(`Kit contract \`${id}\` version must be an exact semantic version.`)
  }

  const methods = createCanonicalMemberMap(input.methods, 'method', id, new Set(['then']))
  const events = createCanonicalMemberMap(input.events, 'event', id, new Set(Object.keys(methods)))
  const policiesResult = normalizeExposurePolicyOptions(input)
  if (!policiesResult.success) {
    const message = policiesResult.reason === 'default-policy'
      ? `Kit contract \`${id}\` default exposure is not allowed.`
      : `Kit contract \`${id}\` has invalid exposure policies.`
    invalidContract(message)
  }

  return Object.freeze({
    id,
    version: input.version,
    methods,
    events,
    allowedExposePolicies: policiesResult.output.effectiveExposePolicies,
    defaultExposePolicy: policiesResult.output.defaultExposePolicy,
  })
}

/**
 * Defines and validates the stable authoring Contract for one Extension-hosted Kit.
 * The Contract describes methods and events. It does not contain a Client factory.
 *
 * @template TMethods Method declarations in this Contract.
 * @template TEvents Event declarations in this Contract.
 * @param contract Contract input to validate and freeze.
 */
export function defineKitContract<TMethods extends KitMethodMap, TEvents extends KitEventMap>(
  contract: KitContract<TMethods, TEvents>,
): KitContract<TMethods, TEvents> {
  return normalizeKitContractInput(captureKitContractInput(contract)) as KitContract<TMethods, TEvents>
}
