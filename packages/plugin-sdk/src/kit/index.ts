import type { Disposable, DisposableStore } from '../extension/disposable'
import type { HostDataValue } from '../plugin-host/shared/types'

import { KitUnavailableError } from './errors'

/** Controls which Host or peer boundary may expose a Kit. */
export type ExposePolicy = 'local-only' | 'remote-observable' | 'remote-callable'

/** Data that can cross a Kit method or event seam. */
export type KitValue = HostDataValue

declare const kitClientType: unique symbol
declare const kitMethodInputType: unique symbol
declare const kitMethodOutputType: unique symbol
declare const kitEventPayloadType: unique symbol

/** Host-provided runtime values used to create a trusted local Kit client. */
export interface KitClientRuntime {
  /** Stable Extension id. */
  extensionId: string
  /** Host-assigned Extension session id. */
  sessionId: string
  /** Stable module id when the Host creates the client for an explicit module scope. */
  moduleId?: string
  /** Cleanup store for the current Extension or module scope. */
  subscriptions: DisposableStore
}

/** Consumer identity and cleanup scope passed to an Extension-hosted Kit method. */
export interface KitCallContext {
  /** Stable id of the Consumer Extension. */
  consumerExtensionId: string
  /** Host-assigned session id of the Consumer Extension. */
  consumerSessionId: string
  /** Stable module id when the Consumer calls through a module scope. */
  consumerModuleId?: string
  /** Cleanup store shared by calls from this generated Client. */
  subscriptions: DisposableStore
}

/** Describes one method in an Extension-hosted Kit contract. */
export interface KitMethodContract<TInput = KitValue | undefined, TOutput = KitValue> {
  readonly kind: 'method'
  readonly [kitMethodInputType]?: TInput
  readonly [kitMethodOutputType]?: TOutput
}

/** Describes one event in an Extension-hosted Kit contract. */
export interface KitEventContract<TPayload = KitValue> {
  readonly kind: 'event'
  readonly [kitEventPayloadType]?: TPayload
}

/** Method declarations keyed by their author-facing Client names. */
export type KitMethodMap = Record<string, KitMethodContract<unknown, unknown>>

/** Event declarations keyed by their author-facing Client names. */
export type KitEventMap = Record<string, KitEventContract<unknown>>

/** Defines one typed method for an Extension-hosted Kit contract. */
export function defineKitMethod<
  TInput,
  TOutput,
>(): KitMethodContract<TInput, TOutput> {
  return { kind: 'method' }
}

/** Defines one typed event for an Extension-hosted Kit contract. */
export function defineKitEvent<TPayload>(): KitEventContract<TPayload> {
  return { kind: 'event' }
}

/**
 * Defines the shared protocol for one Extension-hosted Kit.
 *
 * Provider Extensions register method handlers for this contract. The Host
 * creates Consumer clients and keeps Provider objects inside the Provider
 * session.
 */
export interface KitContract<
  TMethods extends KitMethodMap = KitMethodMap,
  TEvents extends KitEventMap = KitEventMap,
> {
  /** Stable Kit id. */
  id: string
  /** Exact Kit protocol version. */
  version: string
  /** Methods that Consumers can call through the Host. */
  methods: TMethods
  /** Events that Consumers can subscribe to through the Host. */
  events: TEvents
  /** Exposure policies that Providers can select in their manifests. */
  allowedExposePolicies?: ExposePolicy[]
  /** Default exposure policy when the manifest does not override it. */
  defaultExposePolicy?: ExposePolicy
  /** Keeps the generated client type in this type-only contract. */
  readonly [kitClientType]?: KitContractClient<KitContract<TMethods, TEvents>>
}

/**
 * Defines a trusted local Kit implementation installed by the Host.
 *
 * Host Kits can expose local JavaScript capabilities. Extension-hosted Kits
 * must use {@link KitContract} and structured {@link KitValue} payloads.
 */
export interface KitRef<TClient> {
  /** Stable Kit id. */
  id: string
  /** Exact Kit version. */
  version: string
  /** Exposure policies that this Host Kit supports. */
  allowedExposePolicies?: ExposePolicy[]
  /** Default exposure policy when host policy does not override it. */
  defaultExposePolicy?: ExposePolicy
  /** Creates a scope-aware trusted local client. */
  createClient: (runtime: KitClientRuntime) => TClient
}

type KitMethodInput<TMethod> = TMethod extends KitMethodContract<infer TInput, unknown> ? TInput : never
type KitMethodOutput<TMethod> = TMethod extends KitMethodContract<unknown, infer TOutput> ? TOutput : never
type KitEventPayload<TEvent> = TEvent extends KitEventContract<infer TPayload> ? TPayload : never

type KitClientMethod<TMethod> = [KitMethodInput<TMethod>] extends [undefined]
  ? () => Promise<KitMethodOutput<TMethod>>
  : (input: KitMethodInput<TMethod>) => Promise<KitMethodOutput<TMethod>>

/** Host-owned event client exposed to a Consumer. */
export interface KitEventClient<TPayload> {
  /** Subscribes to ordered event payloads for the current Provider session. */
  subscribe: (listener: (payload: TPayload) => void | Promise<void>) => Disposable
}

/** Client that the Host creates from a Kit contract. */
export type KitContractClient<TContract extends KitContract> = {
  [TName in keyof TContract['methods']]: KitClientMethod<TContract['methods'][TName]>
} & {
  [TName in keyof TContract['events']]: KitEventClient<KitEventPayload<TContract['events'][TName]>>
}

type KitProviderMethod<TMethod> = (
  input: KitMethodInput<TMethod>,
  context: KitCallContext,
) => KitMethodOutput<TMethod> | Promise<KitMethodOutput<TMethod>>

/** Provider implementation registered for one Extension-hosted Kit contract. */
export interface KitProvider<TContract extends KitContract> {
  /** Implements every method declared by the shared contract. */
  methods: {
    [TName in keyof TContract['methods']]: KitProviderMethod<TContract['methods'][TName]>
  }
}

/** Registration returned to a Provider Extension. */
export interface KitProviderHandle<TContract extends KitContract> extends Disposable {
  /** Publishes one validated event through the Host. */
  emit: <TName extends keyof TContract['events'] & string>(
    event: TName,
    payload: KitEventPayload<TContract['events'][TName]>,
  ) => void
}

/** Kit definition accepted by the Consumer APIs. */
export type ConsumableKit = KitRef<unknown> | KitContract

/** Resolves the client type for a Host Kit or Extension-hosted Kit contract. */
export type KitClientOf<TKit extends ConsumableKit> = TKit extends KitRef<infer TClient>
  ? TClient
  : TKit extends KitContract
    ? KitContractClient<TKit>
    : never

/** Stable reason returned when the Host cannot create a Kit client. */
export type KitUnavailableReason = 'missing-kit' | 'permission-denied' | 'incompatible-version' | 'not-ready'

/** Result returned when a Consumer requests a Kit without requiring success. */
export type KitUseResult<TKit extends ConsumableKit>
  = | { ok: true, client: KitClientOf<TKit> }
    | { ok: false, reason: KitUnavailableReason, error: Error }

/** Availability snapshot delivered to a Consumer watcher. */
export type KitAvailability<TKit extends ConsumableKit>
  = | { available: true, kit: TKit, client: KitClientOf<TKit> }
    | { available: false, kit: TKit, reason: KitUnavailableReason, error: Error }

/** Defines the identity, methods, and events for one Extension-hosted Kit. */
export function defineKitContract<
  TMethods extends KitMethodMap,
  TEvents extends KitEventMap,
>(contract: KitContract<TMethods, TEvents>): KitContract<TMethods, TEvents> {
  if (!contract.methods || typeof contract.methods !== 'object' || Array.isArray(contract.methods)) {
    throw new TypeError(`Kit contract \`${contract.id}\` methods must be an object.`)
  }
  if (!contract.events || typeof contract.events !== 'object' || Array.isArray(contract.events)) {
    throw new TypeError(`Kit contract \`${contract.id}\` events must be an object.`)
  }

  const methodNames = new Set(Object.keys(contract.methods))
  for (const [methodName, method] of Object.entries(contract.methods)) {
    if (methodName === 'then') {
      throw new TypeError(`Kit contract \`${contract.id}\` cannot declare reserved method \`then\`.`)
    }
    if (method.kind !== 'method') {
      throw new TypeError(`Kit contract \`${contract.id}\` has an invalid method declaration for \`${methodName}\`.`)
    }
  }
  for (const eventName of Object.keys(contract.events)) {
    if (methodNames.has(eventName)) {
      throw new TypeError(`Kit contract \`${contract.id}\` declares \`${eventName}\` as both a method and an event.`)
    }
    if (contract.events[eventName]?.kind !== 'event') {
      throw new TypeError(`Kit contract \`${contract.id}\` has an invalid event declaration for \`${eventName}\`.`)
    }
  }

  return contract
}

/** Defines a trusted local Kit implementation installed by the Host. */
export function defineKit<TClient>(kit: KitRef<TClient>): KitRef<TClient> {
  return kit
}

/** Creates a standard failed result for optional Kit usage. */
export function kitUseFailure<TKit extends ConsumableKit>(
  kit: TKit,
  reason: KitUnavailableReason,
): Extract<KitUseResult<TKit>, { ok: false }> {
  return {
    ok: false,
    reason,
    error: new KitUnavailableError(kit.id, reason),
  }
}

export type { Disposable }
export * from './errors'
