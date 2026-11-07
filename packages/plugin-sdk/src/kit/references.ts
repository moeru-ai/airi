import type { KitContract, KitEventMap, KitMethodContract, KitMethodMap } from './contract'
import type { KitIdentity, KitRef } from './ref'

import semver from 'semver'

declare const kitClientType: unique symbol

/**
 * A Kit identity that carries the client type of the Kit. `ctx.kits.find()` returns it.
 *
 * @param TClient Client type that `ctx.kits.get()` returns for this reference.
 */
export interface KitHandle<TClient = unknown> extends KitIdentity {
  /** Carries the client type. It has no value at run time. */
  readonly [kitClientType]?: TClient
}

type MethodInput<T> = T extends KitMethodContract<infer I, unknown> ? I : never
type MethodOutput<T> = T extends KitMethodContract<unknown, infer O> ? O : never

/**
 * The client of an Extension-provided Kit. Each method sends its input to the provider and resolves with its output.
 * The Host adds the caller identity, so a method takes the input only.
 *
 * @param TMethods Method declarations of the Kit contract.
 */
export type KitContractClient<TMethods extends KitMethodMap> = {
  readonly [K in keyof TMethods]: [MethodInput<TMethods[K]>] extends [undefined]
    ? (input?: undefined) => Promise<MethodOutput<TMethods[K]>>
    : (input: MethodInput<TMethods[K]>) => Promise<MethodOutput<TMethods[K]>>
}

/** A Host Kit reference, a Kit contract, or a handle from `find()`. */
export type KitReference = KitIdentity

/**
 * The client type of a Kit reference.
 *
 * - A Host Kit reference gives the type that its `createClient` returns.
 * - A Kit contract gives a {@link KitContractClient}.
 * - A handle from `find()` gives its carried type.
 */
export type KitClientOf<R>
  = R extends KitRef<infer TClient>
    ? TClient
    : R extends KitContract<infer TMethods, KitEventMap>
      ? KitContractClient<TMethods>
      : R extends KitHandle<infer TClient>
        ? TClient
        : unknown

/** A use of a Kit with a version range in place of the default range. */
export interface RangedKitUse<R extends KitReference = KitReference> {
  readonly kind: 'ranged'
  readonly kit: R
  readonly range: string
}

/** A use of a Kit that the plugin can run without. */
export interface OptionalKitUse<R extends KitReference = KitReference> {
  readonly kind: 'optional'
  readonly kit: R
  readonly range?: string
}

/** One entry of a Kit dependency list: a reference, a ranged use, or an optional use. */
export type KitUse<R extends KitReference = KitReference> = R | RangedKitUse<R> | OptionalKitUse<R>

/** The normalized form of one {@link KitUse}. */
export interface NormalizedKitUse {
  readonly id: string
  readonly range: string
  readonly optional: boolean
}

/** A provider of a Kit, as `ctx.kits.find()` reports it. */
export interface KitProviderInfo {
  readonly kind: 'host' | 'extension'
  /** `host` for a Host Kit, or the id of the plugin that provides the Kit. */
  readonly id: string
}

/** The status of a Kit provider. */
export type KitStatus = 'ready' | 'degraded' | 'unavailable'

/** One Kit provider that a plugin can see. */
export interface KitInfo {
  /** A reference to pass to `ctx.kits.use()` or `narrow()`. */
  readonly ref: KitHandle<unknown>
  readonly id: string
  readonly version: string
  readonly provider: KitProviderInfo
  readonly status: KitStatus
}

/** One plugin that a plugin can see. */
export interface ExtensionInfo {
  readonly id: string
  readonly version: string
  /** The phase of its newest session. */
  readonly phase: 'pending' | 'setting-up' | 'ready' | 'failed' | 'stopped'
  /** The ids of the Kits that its Manifest provides. */
  readonly provides: readonly string[]
}

/** What `ctx.self.rebuild()` started. */
export interface RebuildDecision {
  readonly kind: 'rebuild'
  /** `setup` when the current setup round ends, `running` when an atomic replacement starts. */
  readonly phase: 'setup' | 'running'
  readonly uses: readonly NormalizedKitUse[]
}

function isMarker(value: unknown): value is RangedKitUse | OptionalKitUse {
  return typeof value === 'object'
    && value !== null
    && 'kit' in value
    && 'kind' in value
    && ((value as { kind: unknown }).kind === 'ranged' || (value as { kind: unknown }).kind === 'optional')
}

/**
 * Returns the default version range of a Kit version: `^<major>`.
 *
 * @example
 * defaultKitRange('2.3.1') // => '^2'
 */
export function defaultKitRange(version: string): string {
  const parsed = semver.parse(version)
  return parsed ? `^${parsed.major}` : '*'
}

/**
 * Marks a Kit use as optional. The plugin can start without the Kit, and `ctx.kits.get()` gives `undefined`.
 *
 * @example
 * await ctx.modules.upsert('notes', { kits: [fsStoreKit, optional(autoMemoryKit)], setup })
 */
export function optional<R extends KitReference>(kit: R | RangedKitUse<R>): OptionalKitUse<R> {
  if (isMarker(kit))
    return Object.freeze({ kind: 'optional', kit: kit.kit, range: kit.range })
  return Object.freeze({ kind: 'optional', kit })
}

/**
 * Sets the version range of a Kit use. Without it, the range is `^<major>` of the reference version.
 *
 * @example
 * ctx.kits.get(range(memoryKit, '>=2.1.0 <3'))
 */
export function range<R extends KitReference>(kit: R, versionRange: string): RangedKitUse<R> {
  if (semver.validRange(versionRange) === null)
    throw new TypeError(`Kit \`${kit.id}\` has an invalid version range: ${versionRange}`)
  return Object.freeze({ kind: 'ranged', kit, range: versionRange })
}

/**
 * Checks an unknown Kit reference against a contract.
 * Returns the contract when the ids are equal and the reference version is in the default range of the contract.
 *
 * @example
 * const [first] = ctx.kits.find({ id: 'airi.fs-store' })
 * const fsStore = first && narrow(first.ref, fsStoreKit)
 */
export function narrow<R extends KitReference>(ref: KitReference, contract: R): R | undefined {
  if (ref.id !== contract.id)
    return undefined
  return semver.satisfies(ref.version, defaultKitRange(contract.version), { includePrerelease: true })
    ? contract
    : undefined
}

/**
 * Returns the reference of a Kit use.
 */
export function kitOfUse<R extends KitReference>(use: KitUse<R>): R {
  return isMarker(use) ? use.kit as R : use
}

/**
 * Normalizes one Kit use to its id, its version range, and whether it is optional.
 *
 * @example
 * normalizeKitUse(optional(range(fsStoreKit, '^1.2')))
 * // => { id: 'airi.fs-store', range: '^1.2', optional: true }
 */
export function normalizeKitUse(use: KitUse): NormalizedKitUse {
  if (isMarker(use)) {
    return Object.freeze({
      id: use.kit.id,
      range: use.range ?? defaultKitRange(use.kit.version),
      optional: use.kind === 'optional',
    })
  }
  return Object.freeze({ id: use.id, range: defaultKitRange(use.version), optional: false })
}

/** Creates a handle for a Kit id and version. */
export function createKitHandle<TClient = unknown>(id: string, version: string): KitHandle<TClient> {
  return Object.freeze({ id, version })
}

export type { KitMethodMap }
