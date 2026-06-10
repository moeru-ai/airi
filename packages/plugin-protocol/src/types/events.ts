import type { Eventa } from '@moeru/eventa'
import type { AssistantMessage, CommonContentPart, Message, ToolMessage, UserMessage } from '@xsai/shared-chat'

import { defineEventa } from '@moeru/eventa'

export interface DiscordGuildMember {
  nickname: string
  displayName: string
  id: string
}

export interface Discord {
  guildMember?: DiscordGuildMember
  guildId?: string
  guildName?: string
  channelId?: string
}

export interface PluginIdentity {
  /**
   * Stable plugin identifier (shared across instances).
   * Example: "telegram-bot", "stage-tamagotchi".
   */
  id: string
  /**
   * Optional semantic version for the plugin.
   * Example: "0.8.1-beta.7".
   */
  version?: string
  /**
   * Optional labels attached to the plugin manifest.
   * Example: { env: "prod", app: "telegram", devtools: "true" }.
   */
  labels?: Record<string, string>
}

export interface ModuleIdentity {
  /**
   * Unique module instance id for this module run (per process/deployment).
   * Example: "telegram-01", "stage-ui-2f7c9".
   */
  id: string
  /**
   * Module identity kind. For now only plugin-backed modules are supported.
   */
  kind: 'plugin'
  /**
   * Plugin identity associated with this module instance.
   */
  plugin: PluginIdentity
  /**
   * K8s-style labels for routing and policy selectors.
   * Example: { env: "prod", app: "telegram", devtools: "true" }.
   */
  labels?: Record<string, string>
}

export type MetadataEventSource = ModuleIdentity

/**
 * Static schema metadata for module configuration.
 * This is transport-friendly and can be paired with a JSON Schema-like object.
 *
 * Example:
 *  {
 *    id: "airi.config.stage-ui",
 *    version: 2,
 *    schema: { type: "object", properties: { model: { type: "string" } }, required: ["model"] },
 *  }
 */
export interface ModuleConfigSchema {
  id: string
  version: number
  /**
   * Optional JSON Schema-like descriptor for tooling/validation.
   * Keep it JSON-serializable and avoid runtime-only values.
   */
  schema?: Record<string, unknown>
}

/**
 * Module dependency declaration.
 *
 * Use this during prepare/probe to describe what a module needs before
 * it can decide its dynamic contributions. Dependencies can change at
 * runtime if peers go offline.
 *
 * Example:
 *  { role: "llm:orchestrator", min: "v1", optional: true }
 */
export interface ModuleDependency {
  /**
   * Logical dependency role (preferred over hard-coded plugin ids).
   * Example: "llm:orchestrator"
   */
  role: string
  /**
   * Optional dependency flag.
   */
  optional?: boolean
  /**
   * Version constraint hints.
   */
  version?: string
  min?: string
  max?: string
  /**
   * Additional constraint metadata (JSON-serializable).
   */
  constraints?: Record<string, unknown>
}

/**
 * Dynamic contributions emitted by a module after configuration.
 *
 * Unlike static manifests, contributions can be updated or revoked at
 * runtime. This is where capabilities, provider registrations, and UI
 * extensions should be declared.
 *
 * Example:
 *  {
 *    capabilities: ["context.aggregate"],
 *    providers: [{ id: "vscode-context", type: "context-source" }],
 *    ui: { widgets: ["context-summary-panel"] }
 *  }
 */
export interface ModuleContribution {
  /**
   * Dynamic capabilities exposed by the module.
   */
  capabilities?: string[]
  /**
   * Provider registry contributions (shape defined by the host).
   */
  providers?: Array<Record<string, unknown>>
  /**
   * UI contribution descriptors (widgets, toolbar items, etc).
   */
  ui?: Record<string, unknown>
  /**
   * Hook registrations (event handlers, interceptors, etc).
   */
  hooks?: Array<Record<string, unknown>>
  /**
   * Additional resources or metadata.
   */
  resources?: Record<string, unknown>
}

/**
 * Lifecycle phases for module orchestration and UX.
 */
export type ModulePhase
  = | 'announced'
    | 'preparing'
    | 'prepared'
    | 'configuration-needed'
    | 'configured'
    | 'ready'
    | 'failed'

export type Localizable
  = | string
    | {
    /**
     * Localization key owned by the module.
     * Example: "config.deprecated.model_driver.legacy"
     */
      key: string
      /**
       * Fallback display string when translation is unavailable.
       */
      fallback?: string
      /**
       * Params for string interpolation.
       */
      params?: Record<string, string | number | boolean>
    }

export interface ModuleConfigNotice {
  /**
   * Machine-friendly key for analytics or client-side mapping.
   */
  code?: string
  /**
   * Human readable message or localization key.
   */
  message?: Localizable
  /**
   * JSON pointer or dotted path in config.
   * Example: "driver.legacyModelPath"
   */
  path?: string
  /**
   * Suggested replacement path or alternative.
   */
  replacedBy?: string
  /**
   * Version since the notice applies.
   */
  since?: number
  /**
   * Link to docs or migration guide.
   */
  link?: string
}

export interface ModuleConfigStep {
  /**
   * Suggested action to complete configuration.
   * Use code for UI rendering or message for fallback.
   */
  code?: string
  message?: Localizable
  /**
   * Optional targeted field(s).
   */
  paths?: string[]
}

export interface ModuleConfigPlan {
  /**
   * Schema that this plan targets.
   */
  schema: ModuleConfigSchema
  /**
   * Missing required paths for current schema/version.
   */
  missing?: string[]
  /**
   * Invalid fields with reasons (runtime validation result).
   */
  invalid?: Array<{ path: string, reason: string }>
  /**
   * Recommended defaults computed at runtime (may be environment-specific).
   */
  defaults?: Record<string, unknown>
  /**
   * Deprecated fields/behaviors detected in current config.
   */
  deprecated?: Array<string | ModuleConfigNotice>
  /**
   * Suggested migration steps between schema versions.
   */
  migrations?: Array<{
    from: number
    to: number
    steps?: Array<string | ModuleConfigStep>
    notes?: Array<string | ModuleConfigNotice>
  }>
  /**
   * Human- or UI-friendly next actions to resolve partial config.
   */
  nextSteps?: Array<string | ModuleConfigStep>
  /**
   * Non-blocking issues that should be shown to the user/operator.
   */
  warnings?: Array<string | ModuleConfigNotice>
}

export interface ModuleConfigValidation {
  /**
   * Overall validation status.
   *
   * - valid: all required fields present and valid.
   * - partial: config is structurally OK but missing required fields; can be fixed by patches.
   * - invalid: one or more fields are present but invalid (type/range/format); requires correction.
   */
  status: 'partial' | 'valid' | 'invalid'
  /**
   * Missing required fields (only for partial/invalid).
   */
  missing?: string[]
  /**
   * Invalid fields with reasons (only for invalid).
   */
  invalid?: Array<{ path: string, reason: Localizable }>
  /**
   * Non-blocking issues (e.g., deprecations, best-practice notices).
   */
  warnings?: Array<string | ModuleConfigNotice>
}

/**
 * Config payload envelope for plan/apply/validate/commit.
 *
 * Example:
 *  {
 *    configId: "stage-ui-live2d",
 *    revision: 12,
 *    schemaVersion: 2,
 *    full: { model: "Hiyori", driver: { type: "live2d" } },
 *  }
 */
export interface ModuleConfigEnvelope<C = Record<string, unknown>> {
  configId: string
  /**
   * Monotonic revision number for this configId.
   */
  revision: number
  /**
   * Schema version this config targets.
   */
  schemaVersion: number
  /**
   * Optional source identity (who produced this config).
   */
  source?: ModuleIdentity
  /**
   * Full config payload (use when first applying or rehydrating).
   */
  full?: C
  /**
   * Partial patch payload (use when updating or filling missing fields).
   */
  patch?: Partial<C>
  /**
   * If patch is used, baseRevision should be set for optimistic concurrency.
   */
  baseRevision?: number
}

export interface ModuleCapability {
  /**
   * Stable capability id within a module.
   * Example: "memory.write", "vision.ocr".
   */
  id: string
  /**
   * Human-friendly name.
   */
  name?: string
  /**
   * Optional localized description.
   */
  description?: Localizable
  /**
   * Capability-specific config schema (if needed).
   */
  configSchema?: ModuleConfigSchema
  /**
   * Additional metadata for tooling/UI.
   */
  metadata?: Record<string, unknown>
}

export type ModulePermissionArea = 'apis' | 'resources' | 'capabilities' | 'processors' | 'pipelines'

export interface ModulePermissionSpec<
  Area extends ModulePermissionArea = ModulePermissionArea,
  Action extends string = string,
> {
  key: string
  actions: Action[]
  /**
   * Human-facing explanation for consent/permission UI.
   * Prefer i18n key form over raw strings for localization.
   */
  reason?: Localizable
  /**
   * Optional short display label for permission prompts.
   * Prefer i18n key form over raw strings for localization.
   */
  label?: Localizable
  required?: boolean
  metadata?: Record<string, unknown>
  area?: Area
}

export interface ModulePermissionDeclaration {
  apis?: ModulePermissionSpec<'apis', 'invoke' | 'emit'>[]
  resources?: ModulePermissionSpec<'resources', 'read' | 'write' | 'subscribe'>[]
  capabilities?: ModulePermissionSpec<'capabilities', 'wait' | 'snapshot'>[]
  processors?: ModulePermissionSpec<'processors', 'register' | 'execute' | 'manage'>[]
  pipelines?: ModulePermissionSpec<'pipelines', 'hook' | 'process' | 'emit' | 'manage'>[]
}

export type ModulePermissionGrant = ModulePermissionDeclaration

/**
 * Describes a single authorization failure produced by host-side permission checks.
 *
 * Protocol expectations:
 * - `area`, `action`, and `key` identify the denied operation
 * - `reason` is intended for user-facing or diagnostic context and may be localized
 * - `recoverable` indicates whether the caller may reasonably retry after obtaining consent,
 *   reconfiguration, or a state change
 * - plugins should not treat `reason` as a stable machine-readable code
 */
export interface ModulePermissionError {
  area: ModulePermissionArea
  action: string
  key: string
  reason?: Localizable
  recoverable?: boolean
}

export type DeliveryMode = 'broadcast' | 'consumer' | 'consumer-group'

export type DeliverySelectionStrategy = 'first' | 'round-robin' | 'priority' | 'sticky'

export interface DeliveryConfig {
  mode?: DeliveryMode
  group?: string
  required?: boolean
  selection?: DeliverySelectionStrategy
  stickyKey?: string
}

export interface ProtocolEventaMetadata {
  delivery?: DeliveryConfig
}

export interface ProtocolEventaInvokeMetadata {
  delivery?: Partial<DeliveryConfig>
}

export type ProtocolEventa<P = undefined>
  = Eventa<P, ProtocolEventaMetadata, ProtocolEventaInvokeMetadata>

function defineProtocolEventa<P = undefined>(
  id: string,
  options?: {
    inheritFrom?: ProtocolEventa<P>
    metadata?: ProtocolEventaMetadata
    invokeMetadata?: ProtocolEventaInvokeMetadata
  },
): ProtocolEventa<P> {
  return defineEventa<P, ProtocolEventaMetadata, ProtocolEventaInvokeMetadata>(id, options)
}

export type RouteTargetExpression
  = | { type: 'and', all: RouteTargetExpression[] }
    | { type: 'or', any: RouteTargetExpression[] }
    | { type: 'glob', glob: string, inverted?: boolean }
    | { type: 'ids', ids: string[], inverted?: boolean }
    | { type: 'plugin', plugins: string[], inverted?: boolean }
    | { type: 'instance', instances: string[], inverted?: boolean }
    | { type: 'label', selectors: string[], inverted?: boolean }
    | { type: 'module', modules: string[], inverted?: boolean }
    | { type: 'source', sources: string[], inverted?: boolean }

export interface RouteConfig {
  destinations?: Array<string | RouteTargetExpression>
  bypass?: boolean
  delivery?: DeliveryConfig
}

export enum MessageHeartbeatKind {
  Ping = 'ping',
  Pong = 'pong',
}

export enum MessageHeartbeat {
  Ping = '🩵',
  Pong = '💛',
}

export enum WebSocketEventSource {
  Server = 'proj-airi:server-runtime',
  StageWeb = 'proj-airi:stage-web',
  StageTamagotchi = 'proj-airi:stage-tamagotchi',
}

interface InputSource {
  'stage-web': boolean
  'stage-tamagotchi': boolean
  'discord': Discord
}

interface OutputSource {
  'gen-ai:chat': {
    message: UserMessage
    contexts: Record<string, ContextUpdate<Record<string, any>, unknown>[]>
    composedMessage: Array<Message>
    input?: InputEventEnvelope
  }
}

export enum ContextUpdateStrategy {
  ReplaceSelf = 'replace-self',
  AppendSelf = 'append-self',
}

export interface ContextUpdateDestinationAll {
  all: true
}

export interface ContextUpdateDestinationList {
  include?: Array<string>
  exclude?: Array<string>
}

export type ContextUpdateDestinationFilter
  = | ContextUpdateDestinationAll
    | ContextUpdateDestinationList

export interface ContextUpdate<
  Metadata extends Record<string, any> = Record<string, unknown>,
  // eslint-disable-next-line ts/no-unnecessary-type-constraint
  Content extends any = undefined,
> {
  id: string
  /**
   * Can be the same if same update sends multiple time as attempts
   * and trials, (e.g. notified first but not ACKed, then retried).
   */
  contextId: string
  lane?: string
  ideas?: Array<string>
  hints?: Array<string>
  strategy: ContextUpdateStrategy
  text: string
  content?: Content
  destinations?: Array<string> | ContextUpdateDestinationFilter
  metadata?: Metadata
}

export interface InputMessageOverrides {
  sessionId?: string
  messagePrefix?: string
}

export type InputContextUpdate
  = Omit<ContextUpdate<Record<string, unknown>, string | CommonContentPart[]>, 'id' | 'contextId'>
    & Partial<Pick<ContextUpdate<Record<string, unknown>, string | CommonContentPart[]>, 'id' | 'contextId'>>

export interface WebSocketEventInputTextBase {
  text: string
  textRaw?: string
  overrides?: InputMessageOverrides
  contextUpdates?: InputContextUpdate[]
}

export type WebSocketEventInputText = WebSocketEventInputTextBase & Partial<WithInputSource<'stage-web' | 'stage-tamagotchi' | 'discord'>>

export interface WebSocketEventInputTextVoiceBase {
  transcription: string
  textRaw?: string
  overrides?: InputMessageOverrides
  contextUpdates?: InputContextUpdate[]
}

export type WebSocketEventInputTextVoice = WebSocketEventInputTextVoiceBase & Partial<WithInputSource<'stage-web' | 'stage-tamagotchi' | 'discord'>>

export interface WebSocketEventInputVoiceBase {
  audio: ArrayBuffer
  overrides?: InputMessageOverrides
  contextUpdates?: InputContextUpdate[]
}

export type WebSocketEventInputVoice = WebSocketEventInputVoiceBase & Partial<WithInputSource<'stage-web' | 'stage-tamagotchi' | 'discord'>>

export type InputEventData = WebSocketEventInputText | WebSocketEventInputTextVoice | WebSocketEventInputVoice

export type InputEventEnvelope
  = | { type: 'input:text', data: WebSocketEventInputText }
    | { type: 'input:text:voice', data: WebSocketEventInputTextVoice }
    | { type: 'input:voice', data: WebSocketEventInputVoice }

export interface EventBaseMetadata {
  source?: ModuleIdentity
  event?: {
    id?: string
    parentId?: string
  }
}

export type WithInputSource<Source extends keyof InputSource> = {
  [S in Source]: InputSource[S]
}

export type WithOutputSource<Source extends keyof OutputSource> = {
  [S in Source]: OutputSource[S]
}

// Module orchestration (local or remote transport):
//
// 1) module:authenticate → module:authenticated
// 2) registry:modules:sync (host → module bootstrap)
// 3) module:announce (identity, deps, config schema)
// 4) module:prepared
// 5) module:configuration:* (validate/plan/commit flow)
// 6) module:configuration:configured
// 7) module:contribute:capability:offer (repeat per capability)
// 8) module:contribute:capability:configuration:* (optional)
// 9) module:contribute:capability:activated
// 10) module:status (ready)
// 11) module:status:change (to re-run phases)

interface ModuleAuthenticateEvent {
  token: string
}

interface ModuleAuthenticatedEvent {
  authenticated: boolean
}

interface ModuleCompatibilityRequestEvent {
  protocolVersion: string
  apiVersion: string
  supportedProtocolVersions?: string[]
  supportedApiVersions?: string[]
}

interface ModuleCompatibilityResultEvent {
  protocolVersion: string
  apiVersion: string
  mode: 'exact' | 'downgraded' | 'rejected'
  reason?: string
}

export interface RegistryModulesSyncEvent {
  modules: Array<{
    name: string
    index?: number
    identity: ModuleIdentity
  }>
}

interface ErrorEvent {
  message: string
}

interface ErrorPermissionEvent {
  identity?: ModuleIdentity
  error: ModulePermissionError
}

interface ModuleAnnounceEvent<C = undefined> {
  name: string
  identity: ModuleIdentity
  possibleEvents: Array<(keyof ProtocolEvents<C>)>
  permissions?: ModulePermissionDeclaration
  configSchema?: ModuleConfigSchema
  dependencies?: ModuleDependency[]
}
export interface ModuleAnnouncedEvent {
  name: string
  index?: number
  identity: ModuleIdentity
}

interface ModuleDeAnnouncedEvent {
  name: string
  index?: number
  identity: ModuleIdentity
  reason?: string
}

interface RegistryModulesHealthUnhealthyEvent {
  name: string
  index?: number
  identity: ModuleIdentity
  reason?: string
}

interface RegistryModulesHealthHealthyEvent {
  name: string
  index?: number
  identity: ModuleIdentity

}

/**
 * Emitted when a module declares the permissions it may need.
 *
 * Typical use cases:
 * - manifest-time declaration for installation, review, and audit surfaces
 * - runtime declaration when a module can only discover optional integrations later
 *
 * Protocol expectations:
 * - this event communicates intent only and does not grant access
 * - hosts may record, display, audit, or validate this declaration before any request is approved
 * - plugins must not assume any declared permission is usable until it appears in current grants
 * - `source` indicates whether the declaration originated from static manifest data or runtime code
 */
interface ModulePermissionsDeclareEvent {
  identity: ModuleIdentity
  requested: ModulePermissionDeclaration
  source: 'manifest' | 'runtime'
}

/**
 * Emitted when a module actively asks the host to approve some or all declared permissions.
 *
 * Typical use cases:
 * - deferred consent before first use of a sensitive API or resource
 * - requesting optional capabilities only when a feature is enabled by the user
 *
 * Protocol expectations:
 * - hosts may prompt the user, auto-approve, partially approve, or deny the request
 * - plugins must treat this as a request for evaluation, not as confirmation of access
 * - plugins should provide a user-facing `reason` when approval UX needs explanatory context
 * - the host response may later be expressed through granted, denied, and current permission events
 */
interface ModulePermissionsRequestEvent {
  identity: ModuleIdentity
  requested: ModulePermissionDeclaration
  reason?: string
}

/**
 * Emitted after the host approves additional permissions for a module.
 *
 * Typical use cases:
 * - notifying the runtime that a previous permission request succeeded
 * - allowing plugin code to resume or unlock gated features
 *
 * Protocol expectations:
 * - `granted` may be narrower than the corresponding request
 * - plugins must inspect the granted payload instead of assuming the full request was approved
 * - `revision` increments when the permission snapshot changes and may be used to invalidate cached state
 * - hosts may emit this event before or together with an updated current snapshot
 */
interface ModulePermissionsGrantedEvent {
  identity: ModuleIdentity
  granted: ModulePermissionGrant
  revision: number
}

/**
 * Emitted when some requested permissions are rejected or remain unavailable.
 *
 * Typical use cases:
 * - surfacing partial denials after a consent flow
 * - explaining why a feature must stay disabled or degraded
 *
 * Protocol expectations:
 * - `denied` describes the requested permissions that are not available after evaluation
 * - plugins must handle denial gracefully and should provide fallback behavior when feasible
 * - `reason` is intended for diagnostics or UX context and should not be treated as a stable machine-readable code
 * - `revision` identifies the permission-state version associated with this denial result
 */
interface ModulePermissionsDeniedEvent {
  identity: ModuleIdentity
  denied: ModulePermissionDeclaration
  reason?: string
  revision: number
}

/**
 * Emitted with the module's reconciled current permission snapshot.
 *
 * Typical use cases:
 * - bootstrapping plugin runtime state after startup or reload
 * - synchronizing UI/debug tools with the final requested vs granted view
 *
 * Protocol expectations:
 * - this is the authoritative event for "what is currently allowed"
 * - `requested` is the normalized declaration baseline known to the host
 * - `granted` is the currently granted subset that authorization checks should follow
 * - plugins should prefer this snapshot over local assumptions when reconciling runtime state
 */
interface ModulePermissionsCurrentEvent {
  identity: ModuleIdentity
  requested: ModulePermissionDeclaration
  granted: ModulePermissionGrant
  revision: number
}

interface ModulePreparedEvent {
  identity: ModuleIdentity
  missingDependencies?: ModuleDependency[]
}

interface ModuleConfigurationNeededEvent<C = undefined> {
  identity: ModuleIdentity
  schema?: ModuleConfigSchema
  current?: ModuleConfigEnvelope<C>
  reason?: string
}

interface ModuleStatusEvent {
  identity: ModuleIdentity
  phase: ModulePhase
  reason?: string
  details?: Record<string, unknown>
}

interface ModuleConfigurationValidateRequestEvent<C = undefined> {
  identity: ModuleIdentity
  current?: ModuleConfigEnvelope<C>
}

interface ModuleConfigurationValidateResponseEvent<C = undefined> {
  identity: ModuleIdentity
  validation: ModuleConfigValidation
  plan?: ModuleConfigPlan
  current?: ModuleConfigEnvelope<C>
}

interface ModuleConfigurationValidateStatusEvent {
  identity: ModuleIdentity
  state: 'queued' | 'working' | 'done' | 'failed'
  note?: string
  progress?: number
}

interface ModuleConfigurationPlanRequestEvent<C = undefined> {
  identity: ModuleIdentity
  plan?: ModuleConfigPlan
  current?: ModuleConfigEnvelope<C>
}

interface ModuleConfigurationPlanResponseEvent<C = undefined> {
  identity: ModuleIdentity
  plan: ModuleConfigPlan
  current?: ModuleConfigEnvelope<C>
}

interface ModuleConfigurationPlanStatusEvent {
  identity: ModuleIdentity
  state: 'queued' | 'working' | 'done' | 'failed'
  note?: string
  progress?: number
}

interface ModuleConfigurationCommitEvent<C = undefined> {
  identity: ModuleIdentity
  config: ModuleConfigEnvelope<C>
}

interface ModuleConfigurationCommitStatusEvent {
  identity: ModuleIdentity
  state: 'queued' | 'working' | 'done' | 'failed'
  note?: string
  progress?: number
}

interface ModuleConfigurationConfiguredEvent<C = undefined> {
  identity: ModuleIdentity
  config: ModuleConfigEnvelope<C>
}

interface ModuleContributeCapabilityOfferEvent {
  identity: ModuleIdentity
  capability: ModuleCapability
}

interface ModuleContributeCapabilityConfigurationNeededEvent<C = undefined> {
  identity: ModuleIdentity
  capabilityId: string
  schema?: ModuleConfigSchema
  current?: ModuleConfigEnvelope<C>
  reason?: string
}

interface ModuleContributeCapabilityConfigurationValidateRequestEvent<C = undefined> {
  identity: ModuleIdentity
  capabilityId: string
  current?: ModuleConfigEnvelope<C>
}

interface ModuleContributeCapabilityConfigurationValidateResponseEvent<C = undefined> {
  identity: ModuleIdentity
  capabilityId: string
  validation: ModuleConfigValidation
  plan?: ModuleConfigPlan
  current?: ModuleConfigEnvelope<C>
}

interface ModuleContributeCapabilityConfigurationValidateStatusEvent {
  identity: ModuleIdentity
  capabilityId: string
  state: 'queued' | 'working' | 'done' | 'failed'
  note?: string
  progress?: number
}

interface ModuleContributeCapabilityConfigurationPlanRequestEvent<C = undefined> {
  identity: ModuleIdentity
  capabilityId: string
  plan?: ModuleConfigPlan
  current?: ModuleConfigEnvelope<C>
}

interface ModuleContributeCapabilityConfigurationPlanResponseEvent<C = undefined> {
  identity: ModuleIdentity
  capabilityId: string
  plan: ModuleConfigPlan
  current?: ModuleConfigEnvelope<C>
}

interface ModuleContributeCapabilityConfigurationPlanStatusEvent {
  identity: ModuleIdentity
  capabilityId: string
  state: 'queued' | 'working' | 'done' | 'failed'
  note?: string
  progress?: number
}

interface ModuleContributeCapabilityConfigurationCommitEvent<C = undefined> {
  identity: ModuleIdentity
  capabilityId: string
  config: ModuleConfigEnvelope<C>
}

interface ModuleContributeCapabilityConfigurationCommitStatusEvent {
  identity: ModuleIdentity
  capabilityId: string
  state: 'queued' | 'working' | 'done' | 'failed'
  note?: string
  progress?: number
}

interface ModuleContributeCapabilityConfigurationConfiguredEvent<C = undefined> {
  identity: ModuleIdentity
  capabilityId: string
  config: ModuleConfigEnvelope<C>
}

interface ModuleContributeCapabilityActivatedEvent {
  identity: ModuleIdentity
  capabilityId: string
  active: boolean
  reason?: string
}

interface ModuleStatusChangeEvent {
  identity: ModuleIdentity
  phase: ModulePhase
  reason?: string
  details?: Record<string, unknown>
}

interface ModuleConfigureEvent<C = undefined> {
  config: C | Record<string, unknown>
}

interface ModuleConsumerRegisterEvent {
  event: string
  mode?: Exclude<DeliveryMode, 'broadcast'>
  group?: string
  priority?: number
}

interface ModuleConsumerUnregisterEvent {
  event: string
  mode?: Exclude<DeliveryMode, 'broadcast'>
  group?: string
}

interface UiConfigureEvent<C = undefined> {
  moduleName: string
  moduleIndex?: number
  config: C | Record<string, unknown>
}

type OutputGenAiChatToolCallEvent = {
  toolCalls: ToolMessage[]
} & Partial<WithInputSource<'stage-web' | 'stage-tamagotchi' | 'discord'>> & Partial<WithOutputSource<'gen-ai:chat'>>

type OutputGenAiChatMessageEvent = {
  message: AssistantMessage
} & Partial<WithInputSource<'stage-web' | 'stage-tamagotchi' | 'discord'>> & Partial<WithOutputSource<'gen-ai:chat'>>

interface OutputGenAiChatUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  source: 'provider-based' | 'estimate-based'
}

type OutputGenAiChatCompleteEvent = {
  message: AssistantMessage
  toolCalls: ToolMessage[]
  usage: OutputGenAiChatUsage
} & Partial<WithInputSource<'stage-web' | 'stage-tamagotchi' | 'discord'>> & Partial<WithOutputSource<'gen-ai:chat'>>

interface SparkNotifyEvent {
  id: string
  eventId: string
  lane?: string
  kind: 'alarm' | 'ping' | 'reminder'
  urgency: 'immediate' | 'soon' | 'later'
  headline: string
  note?: string
  payload?: Record<string, unknown>
  ttlMs?: number
  requiresAck?: boolean
  destinations: Array<string>
  metadata?: Record<string, unknown>
}

interface SparkEmitEvent {
  id: string
  eventId?: string
  state: 'queued' | 'working' | 'done' | 'dropped' | 'blocked' | 'expired'
  note?: string
  destinations: Array<string>
  metadata?: Record<string, unknown>
}

interface SparkCommandGuidanceOption {
  label: string
  steps: Array<string>
  rationale?: string
  possibleOutcome?: Array<string>
  risk?: 'high' | 'medium' | 'low' | 'none'
  fallback?: Array<string>
  triggers?: Array<string>
}

interface SparkCommandGuidance {
  type: 'proposal' | 'instruction' | 'memory-recall'
  /**
   * Personas can be used to adjust the behavior of sub-agents.
   * For example, when using as NPC in games, or player in Minecraft,
   * the persona can help define the character's traits and decision-making style.
   *
   * Example:
   *  persona: {
   *    "bravery": "high",
   *    "cautiousness": "low",
   *    "friendliness": "medium"
   *  }
   */
  persona?: Record<string, 'very-high' | 'high' | 'medium' | 'low' | 'very-low'>
  options: Array<SparkCommandGuidanceOption>
}

interface SparkCommandEvent {
  id: string
  eventId?: string
  parentEventId?: string
  commandId: string
  interrupt: 'force' | 'soft' | false
  priority: 'critical' | 'high' | 'normal' | 'low'
  intent: 'plan' | 'proposal' | 'action' | 'pause' | 'resume' | 'reroute' | 'context'
  ack?: string
  guidance?: SparkCommandGuidance
  contexts?: Array<ContextUpdate>
  destinations: Array<string>
}

interface TransportConnectionHeartbeatEvent {
  kind: MessageHeartbeatKind
  message: MessageHeartbeat | string
  at?: number
}

type ContextUpdateEvent = ContextUpdate

export const moduleAuthenticate = defineEventa<ModuleAuthenticateEvent>('module:authenticate')
export const moduleAuthenticated = defineEventa<ModuleAuthenticatedEvent>('module:authenticated')
export const moduleCompatibilityRequest = defineEventa<ModuleCompatibilityRequestEvent>('module:compatibility:request')
export const moduleCompatibilityResult = defineEventa<ModuleCompatibilityResultEvent>('module:compatibility:result')
export const registryModulesSync = defineEventa<RegistryModulesSyncEvent>('registry:modules:sync')
export const registryModulesHealthUnhealthy = defineEventa<RegistryModulesHealthUnhealthyEvent>('registry:modules:health:unhealthy')
export const registryModulesHealthHealthy = defineEventa<RegistryModulesHealthHealthyEvent>('registry:modules:health:healthy')

export const error = defineEventa<ErrorEvent>('error')
/** Permission-check failure event. See `ModulePermissionError`. */
export const errorPermission = defineEventa<ErrorPermissionEvent>('error:permission')

export const moduleAnnounce = defineEventa<ModuleAnnounceEvent>('module:announce')
export const moduleAnnounced = defineEventa<ModuleAnnouncedEvent>('module:announced')
export const moduleDeAnnounced = defineEventa<ModuleDeAnnouncedEvent>('module:de-announced')

/** Permission declaration lifecycle event. See `ModulePermissionsDeclareEvent`. */
export const modulePermissionsDeclare = defineEventa<ModulePermissionsDeclareEvent>('module:permissions:declare')
/** Permission request lifecycle event. See `ModulePermissionsRequestEvent`. */
export const modulePermissionsRequest = defineEventa<ModulePermissionsRequestEvent>('module:permissions:request')
/** Permission grant lifecycle event. See `ModulePermissionsGrantedEvent`. */
export const modulePermissionsGranted = defineEventa<ModulePermissionsGrantedEvent>('module:permissions:granted')
/** Permission denial lifecycle event. See `ModulePermissionsDeniedEvent`. */
export const modulePermissionsDenied = defineEventa<ModulePermissionsDeniedEvent>('module:permissions:denied')
/** Current permission snapshot event. See `ModulePermissionsCurrentEvent`. */
export const modulePermissionsCurrent = defineEventa<ModulePermissionsCurrentEvent>('module:permissions:current')

export const modulePrepared = defineEventa<ModulePreparedEvent>('module:prepared')
export const moduleConfigurationNeeded = defineEventa<ModuleConfigurationNeededEvent>('module:configuration:needed')
export const moduleStatus = defineEventa<ModuleStatusEvent>('module:status')

export const moduleConfigurationValidateRequest = defineEventa<ModuleConfigurationValidateRequestEvent>('module:configuration:validate:request')
export const moduleConfigurationValidateResponse = defineEventa<ModuleConfigurationValidateResponseEvent>('module:configuration:validate:response')
export const moduleConfigurationValidateStatus = defineEventa<ModuleConfigurationValidateStatusEvent>('module:configuration:validate:status')
export const moduleConfigurationPlanRequest = defineEventa<ModuleConfigurationPlanRequestEvent>('module:configuration:plan:request')
export const moduleConfigurationPlanResponse = defineEventa<ModuleConfigurationPlanResponseEvent>('module:configuration:plan:response')
export const moduleConfigurationPlanStatus = defineEventa<ModuleConfigurationPlanStatusEvent>('module:configuration:plan:status')
export const moduleConfigurationCommit = defineEventa<ModuleConfigurationCommitEvent>('module:configuration:commit')
export const moduleConfigurationCommitStatus = defineEventa<ModuleConfigurationCommitStatusEvent>('module:configuration:commit:status')
export const moduleConfigurationConfigured = defineEventa<ModuleConfigurationConfiguredEvent>('module:configuration:configured')

export const moduleContributeCapabilityOffer = defineEventa<ModuleContributeCapabilityOfferEvent>('module:contribute:capability:offer')
export const moduleContributeCapabilityConfigurationNeeded = defineEventa<ModuleContributeCapabilityConfigurationNeededEvent>('module:contribute:capability:configuration:needed')
export const moduleContributeCapabilityConfigurationValidateRequest = defineEventa<ModuleContributeCapabilityConfigurationValidateRequestEvent>('module:contribute:capability:configuration:validate:request')
export const moduleContributeCapabilityConfigurationValidateResponse = defineEventa<ModuleContributeCapabilityConfigurationValidateResponseEvent>('module:contribute:capability:configuration:validate:response')
export const moduleContributeCapabilityConfigurationValidateStatus = defineEventa<ModuleContributeCapabilityConfigurationValidateStatusEvent>('module:contribute:capability:configuration:validate:status')
export const moduleContributeCapabilityConfigurationPlanRequest = defineEventa<ModuleContributeCapabilityConfigurationPlanRequestEvent>('module:contribute:capability:configuration:plan:request')
export const moduleContributeCapabilityConfigurationPlanResponse = defineEventa<ModuleContributeCapabilityConfigurationPlanResponseEvent>('module:contribute:capability:configuration:plan:response')
export const moduleContributeCapabilityConfigurationPlanStatus = defineEventa<ModuleContributeCapabilityConfigurationPlanStatusEvent>('module:contribute:capability:configuration:plan:status')
export const moduleContributeCapabilityConfigurationCommit = defineEventa<ModuleContributeCapabilityConfigurationCommitEvent>('module:contribute:capability:configuration:commit')
export const moduleContributeCapabilityConfigurationCommitStatus = defineEventa<ModuleContributeCapabilityConfigurationCommitStatusEvent>('module:contribute:capability:configuration:commit:status')
export const moduleContributeCapabilityConfigurationConfigured = defineEventa<ModuleContributeCapabilityConfigurationConfiguredEvent>('module:contribute:capability:configuration:configured')
export const moduleContributeCapabilityActivated = defineEventa<ModuleContributeCapabilityActivatedEvent>('module:contribute:capability:activated')

export const moduleStatusChange = defineProtocolEventa<ModuleStatusChangeEvent>('module:status:change')

export const moduleConfigure = defineProtocolEventa<ModuleConfigureEvent>('module:configure')
export const moduleConsumerRegister = defineProtocolEventa<ModuleConsumerRegisterEvent>('module:consumer:register')
export const moduleConsumerUnregister = defineProtocolEventa<ModuleConsumerUnregisterEvent>('module:consumer:unregister')

export const uiConfigure = defineProtocolEventa<UiConfigureEvent>('ui:configure')

export const inputText = defineProtocolEventa<WebSocketEventInputText>('input:text', {
  metadata: {
    delivery: {
      mode: 'consumer-group',
      group: 'chat-ingestion',
      selection: 'first',
    },
  },
})
export const inputTextVoice = defineProtocolEventa<WebSocketEventInputTextVoice>('input:text:voice', {
  metadata: {
    delivery: {
      mode: 'consumer-group',
      group: 'chat-ingestion',
      selection: 'first',
    },
  },
})
export const inputVoice = defineProtocolEventa<WebSocketEventInputVoice>('input:voice', {
  metadata: {
    delivery: {
      mode: 'consumer-group',
      group: 'chat-ingestion',
      selection: 'first',
    },
  },
})

export const outputGenAiChatToolCall = defineProtocolEventa<OutputGenAiChatToolCallEvent>('output:gen-ai:chat:tool-call')
export const outputGenAiChatMessage = defineProtocolEventa<OutputGenAiChatMessageEvent>('output:gen-ai:chat:message')
export const outputGenAiChatComplete = defineProtocolEventa<OutputGenAiChatCompleteEvent>('output:gen-ai:chat:complete')

export const sparkNotify = defineProtocolEventa<SparkNotifyEvent>('spark:notify')
export const sparkEmit = defineProtocolEventa<SparkEmitEvent>('spark:emit')
export const sparkCommand = defineProtocolEventa<SparkCommandEvent>('spark:command')

export const transportConnectionHeartbeat = defineProtocolEventa<TransportConnectionHeartbeatEvent>('transport:connection:heartbeat')
export const contextUpdate = defineProtocolEventa<ContextUpdateEvent>('context:update')

export const protocolEventMetadataByType = {
  [inputText.id]: inputText.metadata,
  [inputTextVoice.id]: inputTextVoice.metadata,
  [inputVoice.id]: inputVoice.metadata,
} satisfies Partial<Record<keyof ProtocolEvents, ProtocolEventaMetadata | undefined>>

export function getProtocolEventMetadata(eventType: keyof ProtocolEvents | string) {
  return protocolEventMetadataByType[eventType as keyof typeof protocolEventMetadataByType]
}

// Thanks to:
//
// A little hack for creating extensible discriminated unions : r/typescript
// https://www.reddit.com/r/typescript/comments/1064ibt/a_little_hack_for_creating_extensible/
export interface ProtocolEvents<C = undefined> {
  'error': ErrorEvent
  'error:permission': ErrorPermissionEvent

  'module:authenticate': ModuleAuthenticateEvent
  'module:authenticated': ModuleAuthenticatedEvent
  /**
   * Plugin asks host to negotiate protocol + API compatibility.
   */
  'module:compatibility:request': ModuleCompatibilityRequestEvent
  /**
   * Host replies with accepted mode/result for protocol + API compatibility.
   */
  'module:compatibility:result': ModuleCompatibilityResultEvent
  /**
   * Server-side registry sync for known online modules.
   * Sent to newly authenticated peers to bootstrap module discovery.
   */
  'registry:modules:sync': RegistryModulesSyncEvent
  /**
   * Broadcast when a module's heartbeat expires (unhealthy).
   */
  'registry:modules:health:unhealthy': RegistryModulesHealthUnhealthyEvent
  /**
   * Broadcast when a previously unhealthy module resumes heartbeating (healthy again).
   */
  'registry:modules:health:healthy': RegistryModulesHealthHealthyEvent
  /**
   * Broadcast to all peers when a module announces itself, with its identity, static metadata, and declared dependencies.
   * Host can use this to decide when to prepare/configure modules based on their needs and capabilities.
   * Module that registering self can use this to declare its presence and what it offers, and to trigger orchestration flows in the host or other modules.
   *
   *
   * NOTICE: Modules that would love to discover peers SHOULD NOT wait or listen to this event, instead
   * module:announced or module:de-announced, or registry:modules:sync and registry:modules:health:* events for more reliable discovery and tracking.
   */
  'module:announce': ModuleAnnounceEvent<C>
  'module:permissions:declare': ModulePermissionsDeclareEvent
  'module:permissions:request': ModulePermissionsRequestEvent
  'module:permissions:granted': ModulePermissionsGrantedEvent
  'module:permissions:denied': ModulePermissionsDeniedEvent
  'module:permissions:current': ModulePermissionsCurrentEvent
  /**
   * Broadcast to all peers when a module successfully announces.
   */
  'module:announced': ModuleAnnouncedEvent
  /**
   * Broadcast to all peers when a module is unregistered (disconnect, heartbeat expiry, error, etc).
   */
  'module:de-announced': ModuleDeAnnouncedEvent
  /**
   * Prepare completed. Host can move into config apply/validate.
   *
   * Example:
   *  module:prepared { missingDependencies: [] }
   */
  'module:prepared': ModulePreparedEvent
  /**
   * Module needs configuration to proceed to prepared/configured.
   */
  'module:configuration:needed': ModuleConfigurationNeededEvent<C>
  /**
   * Lifecycle status updates for orchestration/UX.
   *
   * Example:
   *  module:status { phase: "ready" }
   */
  'module:status': ModuleStatusEvent
  /**
   * Ask the module to validate current config (host → module).
   */
  'module:configuration:validate:request': ModuleConfigurationValidateRequestEvent<C>
  /**
   * Validation response (module → host), with optional plan suggestions.
   */
  'module:configuration:validate:response': ModuleConfigurationValidateResponseEvent<C>
  /**
   * Status updates for validation (module → host).
   */
  'module:configuration:validate:status': ModuleConfigurationValidateStatusEvent
  /**
   * Configuration planning request (host → module).
   */
  'module:configuration:plan:request': ModuleConfigurationPlanRequestEvent<C>
  /**
   * Configuration planning response (module → host).
   */
  'module:configuration:plan:response': ModuleConfigurationPlanResponseEvent<C>
  /**
   * Status updates for planning (module → host).
   */
  'module:configuration:plan:status': ModuleConfigurationPlanStatusEvent
  /**
   * Commit a config as "active" (host → module).
   */
  'module:configuration:commit': ModuleConfigurationCommitEvent<C>
  /**
   * Status updates for commit (module → host).
   */
  'module:configuration:commit:status': ModuleConfigurationCommitStatusEvent
  /**
   * Configuration fully applied and active (module → host).
   */
  'module:configuration:configured': ModuleConfigurationConfiguredEvent<C>
  /**
   * Capability offer emitted after module configuration.
   */
  'module:contribute:capability:offer': ModuleContributeCapabilityOfferEvent
  /**
   * Capability needs configuration before activation.
   */
  'module:contribute:capability:configuration:needed': ModuleContributeCapabilityConfigurationNeededEvent<C>
  'module:contribute:capability:configuration:validate:request': ModuleContributeCapabilityConfigurationValidateRequestEvent<C>
  'module:contribute:capability:configuration:validate:response': ModuleContributeCapabilityConfigurationValidateResponseEvent<C>
  'module:contribute:capability:configuration:validate:status': ModuleContributeCapabilityConfigurationValidateStatusEvent
  'module:contribute:capability:configuration:plan:request': ModuleContributeCapabilityConfigurationPlanRequestEvent<C>
  'module:contribute:capability:configuration:plan:response': ModuleContributeCapabilityConfigurationPlanResponseEvent<C>
  'module:contribute:capability:configuration:plan:status': ModuleContributeCapabilityConfigurationPlanStatusEvent
  'module:contribute:capability:configuration:commit': ModuleContributeCapabilityConfigurationCommitEvent<C>
  'module:contribute:capability:configuration:commit:status': ModuleContributeCapabilityConfigurationCommitStatusEvent
  'module:contribute:capability:configuration:configured': ModuleContributeCapabilityConfigurationConfiguredEvent<C>
  'module:contribute:capability:activated': ModuleContributeCapabilityActivatedEvent
  /**
   * Request a phase transition (module → host).
   */
  'module:status:change': ModuleStatusChangeEvent
  /**
   * Push configuration down to module (host → module).
   */
  'module:configure': ModuleConfigureEvent<C>
  /**
   * Register the current module instance as a consumer for an event or event group.
   */
  'module:consumer:register': ModuleConsumerRegisterEvent
  /**
   * Unregister the current module instance from an event consumer registration.
   */
  'module:consumer:unregister': ModuleConsumerUnregisterEvent

  'ui:configure': UiConfigureEvent<C>

  'input:text': WebSocketEventInputText
  'input:text:voice': WebSocketEventInputTextVoice
  'input:voice': WebSocketEventInputVoice

  'output:gen-ai:chat:tool-call': OutputGenAiChatToolCallEvent
  'output:gen-ai:chat:message': OutputGenAiChatMessageEvent
  'output:gen-ai:chat:complete': OutputGenAiChatCompleteEvent

  /**
   * Spark used for allowing agents in a network to raise an event toward the other destinations (e.g. character).
   *
   * DO:
   * - Use notify for episodic events (alarms/pings/reminders) with minimal payload.
   * - Use command for high-level intent; let sub-agents translate into their own state machines.
   * - Use emit for ack/progress/completion; include ids for tracing/dedupe.
   * - Route via destinations; keep payloads small; use context:update for richer ideas.
   * - Dedupe/log via id/eventId for observability.
   *
   * DOn't:
   * - Stream high-frequency telemetry here (keep a separate channel).
   * - Stuff large blobs into payload/contexts; prefer refs/summaries.
   * - Assume exactly-once; add retry/ack on critical paths. You may rely on id/eventId for dedupe.
   * - Allow untrusted agents to broadcast without auth/capability checks.
   *
   * Examples:
   * - Minecraft attack/death: kind=alarm, urgency=immediate (fast bubble-up).
   *   e.g., fromAgent='minecraft', headline='Under attack by witch', payload includes hp/location/gear.
   * - Cat bowl empty from HomeAssistant: kind=alarm, urgency=soon.
   * - IM/email "read now": kind=ping, urgency=immediate.
   * - Action Required email: kind=reminder, urgency=later.
   *
   * destinations controls routing (e.g. ['character'], ['character','minecraft-agent']).
   */
  'spark:notify': SparkNotifyEvent

  /**
   * Acknowledgement/progress/state for a spark or command (bidirectional).
   * Examples:
   * - Character: state=working, note="Seen it, responding".
   * - Sub-agent: state=done, note="Healed and safe".
   * - Sub-agent: state=blocked/dropped with note when it cannot comply.
   * - Minecraft: state=working, note="Pillared up; healing" in reply to a command.
   */
  'spark:emit': SparkEmitEvent

  /**
   * Character issues instructions or context to a sub-agent.
   * interrupt: force = hard preempt; soft = merge/queue.
   * Examples:
   * - Witch attack: interrupt=force, priority=critical, intent=action with options (aggressive/cautious).
   *   e.g., options to block/retreat vs push with shield/sword, with fallback steps.
   * - Prep plan: interrupt=soft, priority=high, intent=plan with steps/fallbacks.
   * - Contextual hints: intent=context with contextPatch ideas/hints.
   */
  'spark:command': SparkCommandEvent

  'transport:connection:heartbeat': TransportConnectionHeartbeatEvent

  'context:update': ContextUpdateEvent
}

export type ProtocolEventOf<E, C = undefined> = E extends keyof ProtocolEvents<C>
  ? Omit<ProtocolEvents<C>[E], 'metadata'> & { metadata?: Record<string, unknown> }
  : never
