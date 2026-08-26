import type { Eventa } from '@moeru/eventa'
import type { AssistantMessage, CommonContentPart, Message, ToolMessage, UserMessage } from '@xsai/shared-chat'

import { defineEventa } from '@moeru/eventa'

export enum ContextUpdateStrategy {
  AppendSelf = 'append-self',
  ReplaceSelf = 'replace-self',
}

export enum MessageHeartbeat {
  Ping = '🩵',
  Pong = '💛',
}

export enum MessageHeartbeatKind {
  Ping = 'ping',
  Pong = 'pong',
}

export enum WebSocketEventSource {
  Server = 'proj-airi:server-runtime',
  StageTamagotchi = 'proj-airi:stage-tamagotchi',
  StageWeb = 'proj-airi:stage-web',
}

export interface ContextUpdate<
  Metadata extends Record<string, any> = Record<string, unknown>,
  // eslint-disable-next-line ts/no-unnecessary-type-constraint
  Content extends any = undefined,
> {
  content?: Content
  /**
   * Can be the same if same update sends multiple time as attempts
   * and trials, (e.g. notified first but not ACKed, then retried).
   */
  contextId: string
  destinations?: Array<string> | ContextUpdateDestinationFilter
  hints?: Array<string>
  id: string
  ideas?: Array<string>
  lane?: string
  metadata?: Metadata
  strategy: ContextUpdateStrategy
  text: string
}

export interface ContextUpdateDestinationAll {
  all: true
}

export type ContextUpdateDestinationFilter
  = | ContextUpdateDestinationAll
    | ContextUpdateDestinationList

export interface ContextUpdateDestinationList {
  exclude?: Array<string>
  include?: Array<string>
}

export interface DeliveryConfig {
  group?: string
  mode?: DeliveryMode
  required?: boolean
  selection?: DeliverySelectionStrategy
  stickyKey?: string
}

export type DeliveryMode = 'broadcast' | 'consumer' | 'consumer-group'

export type DeliverySelectionStrategy = 'first' | 'priority' | 'round-robin' | 'sticky'

export interface Discord {
  channelId?: string
  guildId?: string
  guildMember?: DiscordGuildMember
  guildName?: string
}

export interface DiscordGuildMember {
  displayName: string
  id: string
  nickname: string
}

export interface EventBaseMetadata {
  event?: {
    id?: string
    parentId?: string
  }
  source?: ModuleIdentity
}

/**
 * Identifies an extension package/session that is loaded by an extension host.
 *
 * Extension identity is the package/session-level scope. Modules registered by
 * the extension get their own {@link ExtensionModuleIdentity}.
 */
export interface ExtensionIdentity {
  /**
   * Stable extension identifier from `extension.airi.json`.
   */
  id: string
  /**
   * Optional labels used for routing, inspection, and policy selectors.
   */
  labels?: Record<string, string>
  /**
   * Optional runtime session id assigned by the host for this loaded extension.
   */
  sessionId?: string
  /**
   * Optional semantic version for the extension package.
   */
  version?: string
}

/**
 * Identifies a kit API surface that can be used by extension modules.
 */
export interface ExtensionKitIdentity {
  /**
   * Stable kit id.
   */
  id: string
  /**
   * Optional labels used for routing, inspection, and policy selectors.
   */
  labels?: Record<string, string>
  /**
   * Optional owner for future extension-provided kits. Host-provided kits omit this field.
   */
  ownerExtension?: ExtensionIdentity
  /**
   * Optional semantic version for compatibility checks.
   */
  version?: string
}

/**
 * Identifies one runtime module registered by an extension setup function.
 */
export interface ExtensionModuleIdentity {
  /**
   * Owning extension session identity.
   */
  extension: ExtensionIdentity
  /**
   * Stable module id within one extension session.
   */
  id: string
  /**
   * Optional labels used for routing, inspection, and policy selectors.
   */
  labels?: Record<string, string>
}

export type InputContextUpdate
  = Omit<ContextUpdate<Record<string, unknown>, CommonContentPart[] | string>, 'contextId' | 'id'>
    & Partial<Pick<ContextUpdate<Record<string, unknown>, CommonContentPart[] | string>, 'contextId' | 'id'>>

export type InputEventData = WebSocketEventInputText | WebSocketEventInputTextVoice | WebSocketEventInputVoice

export type InputEventEnvelope
  = | { data: WebSocketEventInputText, type: 'input:text' }
    | { data: WebSocketEventInputTextVoice, type: 'input:text:voice' }
    | { data: WebSocketEventInputVoice, type: 'input:voice' }

export interface InputMessageOverrides {
  messagePrefix?: string
  sessionId?: string
}

export type Localizable
  = | string
    | {
    /**
     * Fallback display string when translation is unavailable.
     */
      fallback?: string
      /**
       * Localization key owned by the module.
       * Example: "config.deprecated.model_driver.legacy"
       */
      key: string
      /**
       * Params for string interpolation.
       */
      params?: Record<string, boolean | number | string>
    }

export type MetadataEventSource = ExtensionIdentity | ExtensionKitIdentity | ExtensionModuleIdentity | ModuleIdentity

export interface ModuleAnnouncedEvent {
  identity: ModuleIdentity
  index?: number
  name: string
}

export interface ModuleCapability {
  /**
   * Capability-specific config schema (if needed).
   */
  configSchema?: ModuleConfigSchema
  /**
   * Optional localized description.
   */
  description?: Localizable
  /**
   * Stable capability id within a module.
   * Example: "memory.write", "vision.ocr".
   */
  id: string
  /**
   * Additional metadata for tooling/UI.
   */
  metadata?: Record<string, unknown>
  /**
   * Human-friendly name.
   */
  name?: string
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
  /**
   * If patch is used, baseRevision should be set for optimistic concurrency.
   */
  baseRevision?: number
  configId: string
  /**
   * Full config payload (use when first applying or rehydrating).
   */
  full?: C
  /**
   * Partial patch payload (use when updating or filling missing fields).
   */
  patch?: Partial<C>
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
}

export interface ModuleConfigNotice {
  /**
   * Machine-friendly key for analytics or client-side mapping.
   */
  code?: string
  /**
   * Link to docs or migration guide.
   */
  link?: string
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
}

export interface ModuleConfigPlan {
  /**
   * Recommended defaults computed at runtime (may be environment-specific).
   */
  defaults?: Record<string, unknown>
  /**
   * Deprecated fields/behaviors detected in current config.
   */
  deprecated?: Array<ModuleConfigNotice | string>
  /**
   * Invalid fields with reasons (runtime validation result).
   */
  invalid?: Array<{ path: string, reason: string }>
  /**
   * Suggested migration steps between schema versions.
   */
  migrations?: Array<{
    from: number
    notes?: Array<ModuleConfigNotice | string>
    steps?: Array<ModuleConfigStep | string>
    to: number
  }>
  /**
   * Missing required paths for current schema/version.
   */
  missing?: string[]
  /**
   * Human- or UI-friendly next actions to resolve partial config.
   */
  nextSteps?: Array<ModuleConfigStep | string>
  /**
   * Schema that this plan targets.
   */
  schema: ModuleConfigSchema
  /**
   * Non-blocking issues that should be shown to the user/operator.
   */
  warnings?: Array<ModuleConfigNotice | string>
}

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
  /**
   * Optional JSON Schema-like descriptor for tooling/validation.
   * Keep it JSON-serializable and avoid runtime-only values.
   */
  schema?: Record<string, unknown>
  version: number
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

export interface ModuleConfigValidation {
  /**
   * Invalid fields with reasons (only for invalid).
   */
  invalid?: Array<{ path: string, reason: Localizable }>
  /**
   * Missing required fields (only for partial/invalid).
   */
  missing?: string[]
  /**
   * Overall validation status.
   *
   * - valid: all required fields present and valid.
   * - partial: config is structurally OK but missing required fields; can be fixed by patches.
   * - invalid: one or more fields are present but invalid (type/range/format); requires correction.
   */
  status: 'invalid' | 'partial' | 'valid'
  /**
   * Non-blocking issues (e.g., deprecations, best-practice notices).
   */
  warnings?: Array<ModuleConfigNotice | string>
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
   * Hook registrations (event handlers, interceptors, etc).
   */
  hooks?: Array<Record<string, unknown>>
  /**
   * Provider registry contributions (shape defined by the host).
   */
  providers?: Array<Record<string, unknown>>
  /**
   * Additional resources or metadata.
   */
  resources?: Record<string, unknown>
  /**
   * UI contribution descriptors (widgets, toolbar items, etc).
   */
  ui?: Record<string, unknown>
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
   * Additional constraint metadata (JSON-serializable).
   */
  constraints?: Record<string, unknown>
  max?: string
  min?: string
  /**
   * Optional dependency flag.
   */
  optional?: boolean
  /**
   * Logical dependency role (preferred over hard-coded plugin ids).
   * Example: "llm:orchestrator"
   */
  role: string
  /**
   * Version constraint hints.
   */
  version?: string
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
   * K8s-style labels for routing and policy selectors.
   * Example: { env: "prod", app: "telegram", devtools: "true" }.
   */
  labels?: Record<string, string>
  /**
   * Plugin identity associated with this module instance.
   */
  plugin: PluginIdentity
}

export type ModulePermissionArea = 'apis' | 'capabilities' | 'pipelines' | 'processors' | 'resources'

export interface ModulePermissionDeclaration {
  apis?: ModulePermissionSpec<'apis', 'emit' | 'invoke'>[]
  capabilities?: ModulePermissionSpec<'capabilities', 'snapshot' | 'wait'>[]
  pipelines?: ModulePermissionSpec<'pipelines', 'emit' | 'hook' | 'manage' | 'process'>[]
  processors?: ModulePermissionSpec<'processors', 'execute' | 'manage' | 'register'>[]
  resources?: ModulePermissionSpec<'resources', 'read' | 'subscribe' | 'write'>[]
}

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
  action: string
  area: ModulePermissionArea
  key: string
  reason?: Localizable
  recoverable?: boolean
}

export type ModulePermissionGrant = ModulePermissionDeclaration

export interface ModulePermissionSpec<
  Area extends ModulePermissionArea = ModulePermissionArea,
  Action extends string = string,
> {
  actions: Action[]
  area?: Area
  key: string
  /**
   * Optional short display label for permission prompts.
   * Prefer i18n key form over raw strings for localization.
   */
  label?: Localizable
  metadata?: Record<string, unknown>
  /**
   * Human-facing explanation for consent/permission UI.
   * Prefer i18n key form over raw strings for localization.
   */
  reason?: Localizable
  required?: boolean
}

/**
 * Lifecycle phases for module orchestration and UX.
 */
export type ModulePhase
  = | 'announced'
    | 'configuration-needed'
    | 'configured'
    | 'failed'
    | 'prepared'
    | 'preparing'
    | 'ready'

export interface PluginIdentity {
  /**
   * Stable plugin identifier (shared across instances).
   * Example: "telegram-bot", "stage-tamagotchi".
   */
  id: string
  /**
   * Optional labels attached to the extension manifest.
   * Example: { env: "prod", app: "telegram", devtools: "true" }.
   */
  labels?: Record<string, string>
  /**
   * Optional semantic version for the plugin.
   * Example: "0.8.1-beta.7".
   */
  version?: string
}

export type ProtocolEventa<P = undefined>
  = Eventa<P, ProtocolEventaMetadata, ProtocolEventaInvokeMetadata>

export interface ProtocolEventaInvokeMetadata {
  delivery?: Partial<DeliveryConfig>
}

export interface ProtocolEventaMetadata {
  delivery?: DeliveryConfig
}

export interface RegistryModulesSyncEvent {
  modules: Array<{
    identity: MetadataEventSource
    index?: number
    name: string
  }>
}

export interface RouteConfig {
  bypass?: boolean
  delivery?: DeliveryConfig
  destinations?: Array<RouteTargetExpression | string>
}

export type RouteTargetExpression
  = | { all: RouteTargetExpression[], type: 'and' }
    | { any: RouteTargetExpression[], type: 'or' }
    | { glob: string, inverted?: boolean, type: 'glob' }
    | { ids: string[], inverted?: boolean, type: 'ids' }
    | { instances: string[], inverted?: boolean, type: 'instance' }
    | { inverted?: boolean, modules: string[], type: 'module' }
    | { inverted?: boolean, plugins: string[], type: 'plugin' }
    | { inverted?: boolean, selectors: string[], type: 'label' }
    | { inverted?: boolean, sources: string[], type: 'source' }

export type WebSocketEventInputText = Partial<WithInputSource<'discord' | 'stage-tamagotchi' | 'stage-web'>> & WebSocketEventInputTextBase

export interface WebSocketEventInputTextBase {
  contextUpdates?: InputContextUpdate[]
  overrides?: InputMessageOverrides
  text: string
  textRaw?: string
}

export type WebSocketEventInputTextVoice = Partial<WithInputSource<'discord' | 'stage-tamagotchi' | 'stage-web'>> & WebSocketEventInputTextVoiceBase

export interface WebSocketEventInputTextVoiceBase {
  contextUpdates?: InputContextUpdate[]
  overrides?: InputMessageOverrides
  textRaw?: string
  transcription: string
}

export type WebSocketEventInputVoice = Partial<WithInputSource<'discord' | 'stage-tamagotchi' | 'stage-web'>> & WebSocketEventInputVoiceBase

export interface WebSocketEventInputVoiceBase {
  audio: ArrayBuffer
  contextUpdates?: InputContextUpdate[]
  overrides?: InputMessageOverrides
}

export type WithInputSource<Source extends keyof InputSource> = {
  [S in Source]: InputSource[S]
}

export type WithOutputSource<Source extends keyof OutputSource> = {
  [S in Source]: OutputSource[S]
}

type ContextUpdateEvent = ContextUpdate

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

interface ErrorEvent {
  message: string
}

interface ErrorPermissionEvent {
  error: ModulePermissionError
  identity?: ModuleIdentity
}

interface ExtensionAnnounceEvent {
  identity: ExtensionIdentity
  permissions?: ModulePermissionDeclaration
}

interface ExtensionAuthenticatedEvent {
  authenticated: boolean
  identity: ExtensionIdentity
  reason?: string
}

interface ExtensionAuthenticateEvent {
  identity: ExtensionIdentity
  token?: string
}

interface ExtensionKitAnnounceEvent {
  capabilities?: ModuleCapability[]
  identity: ExtensionKitIdentity
}

interface ExtensionModuleAnnounceEvent<C = undefined> {
  configSchema?: ModuleConfigSchema
  dependencies?: ModuleDependency[]
  identity: ExtensionModuleIdentity
  name: string
  permissions?: ModulePermissionDeclaration
  possibleEvents: Array<(keyof ProtocolEvents<C>)>
}

interface InputSource {
  'discord': Discord
  'stage-tamagotchi': boolean
  'stage-web': boolean
}

interface ModuleAnnounceEvent<C = undefined> {
  configSchema?: ModuleConfigSchema
  dependencies?: ModuleDependency[]
  identity: ModuleIdentity
  name: string
  permissions?: ModulePermissionDeclaration
  possibleEvents: Array<(keyof ProtocolEvents<C>)>
}

interface ModuleAuthenticatedEvent {
  authenticated: boolean
}

interface ModuleAuthenticateEvent {
  token: string
}

interface ModuleCompatibilityRequestEvent {
  apiVersion: string
  protocolVersion: string
  supportedApiVersions?: string[]
  supportedProtocolVersions?: string[]
}

interface ModuleCompatibilityResultEvent {
  apiVersion: string
  mode: 'downgraded' | 'exact' | 'rejected'
  protocolVersion: string
  reason?: string
}

interface ModuleConfigurationCommitEvent<C = undefined> {
  config: ModuleConfigEnvelope<C>
  identity: ModuleIdentity
}

interface ModuleConfigurationCommitStatusEvent {
  identity: ModuleIdentity
  note?: string
  progress?: number
  state: 'done' | 'failed' | 'queued' | 'working'
}

interface ModuleConfigurationConfiguredEvent<C = undefined> {
  config: ModuleConfigEnvelope<C>
  identity: ModuleIdentity
}

interface ModuleConfigurationNeededEvent<C = undefined> {
  current?: ModuleConfigEnvelope<C>
  identity: ModuleIdentity
  reason?: string
  schema?: ModuleConfigSchema
}
interface ModuleConfigurationPlanRequestEvent<C = undefined> {
  current?: ModuleConfigEnvelope<C>
  identity: ModuleIdentity
  plan?: ModuleConfigPlan
}

interface ModuleConfigurationPlanResponseEvent<C = undefined> {
  current?: ModuleConfigEnvelope<C>
  identity: ModuleIdentity
  plan: ModuleConfigPlan
}

interface ModuleConfigurationPlanStatusEvent {
  identity: ModuleIdentity
  note?: string
  progress?: number
  state: 'done' | 'failed' | 'queued' | 'working'
}

interface ModuleConfigurationValidateRequestEvent<C = undefined> {
  current?: ModuleConfigEnvelope<C>
  identity: ModuleIdentity
}

interface ModuleConfigurationValidateResponseEvent<C = undefined> {
  current?: ModuleConfigEnvelope<C>
  identity: ModuleIdentity
  plan?: ModuleConfigPlan
  validation: ModuleConfigValidation
}

interface ModuleConfigurationValidateStatusEvent {
  identity: ModuleIdentity
  note?: string
  progress?: number
  state: 'done' | 'failed' | 'queued' | 'working'
}

interface ModuleConfigureEvent<C = undefined> {
  config: C | Record<string, unknown>
}

interface ModuleConsumerRegisterEvent {
  event: string
  group?: string
  mode?: Exclude<DeliveryMode, 'broadcast'>
  priority?: number
}

interface ModuleConsumerUnregisterEvent {
  event: string
  group?: string
  mode?: Exclude<DeliveryMode, 'broadcast'>
}

interface ModuleContributeCapabilityActivatedEvent {
  active: boolean
  capabilityId: string
  identity: ModuleIdentity
  reason?: string
}

interface ModuleContributeCapabilityConfigurationCommitEvent<C = undefined> {
  capabilityId: string
  config: ModuleConfigEnvelope<C>
  identity: ModuleIdentity
}

interface ModuleContributeCapabilityConfigurationCommitStatusEvent {
  capabilityId: string
  identity: ModuleIdentity
  note?: string
  progress?: number
  state: 'done' | 'failed' | 'queued' | 'working'
}

interface ModuleContributeCapabilityConfigurationConfiguredEvent<C = undefined> {
  capabilityId: string
  config: ModuleConfigEnvelope<C>
  identity: ModuleIdentity
}

interface ModuleContributeCapabilityConfigurationNeededEvent<C = undefined> {
  capabilityId: string
  current?: ModuleConfigEnvelope<C>
  identity: ModuleIdentity
  reason?: string
  schema?: ModuleConfigSchema
}

interface ModuleContributeCapabilityConfigurationPlanRequestEvent<C = undefined> {
  capabilityId: string
  current?: ModuleConfigEnvelope<C>
  identity: ModuleIdentity
  plan?: ModuleConfigPlan
}

interface ModuleContributeCapabilityConfigurationPlanResponseEvent<C = undefined> {
  capabilityId: string
  current?: ModuleConfigEnvelope<C>
  identity: ModuleIdentity
  plan: ModuleConfigPlan
}

interface ModuleContributeCapabilityConfigurationPlanStatusEvent {
  capabilityId: string
  identity: ModuleIdentity
  note?: string
  progress?: number
  state: 'done' | 'failed' | 'queued' | 'working'
}

interface ModuleContributeCapabilityConfigurationValidateRequestEvent<C = undefined> {
  capabilityId: string
  current?: ModuleConfigEnvelope<C>
  identity: ModuleIdentity
}

interface ModuleContributeCapabilityConfigurationValidateResponseEvent<C = undefined> {
  capabilityId: string
  current?: ModuleConfigEnvelope<C>
  identity: ModuleIdentity
  plan?: ModuleConfigPlan
  validation: ModuleConfigValidation
}

interface ModuleContributeCapabilityConfigurationValidateStatusEvent {
  capabilityId: string
  identity: ModuleIdentity
  note?: string
  progress?: number
  state: 'done' | 'failed' | 'queued' | 'working'
}

interface ModuleContributeCapabilityOfferEvent {
  capability: ModuleCapability
  identity: ModuleIdentity
}

interface ModuleDeAnnouncedEvent {
  identity: ModuleIdentity
  index?: number
  name: string
  reason?: string
}

/**
 * Emitted with the module's reconciled current permission snapshot.
 *
 * Typical use cases:
 * - bootstrapping extension runtime state after startup or reload
 * - synchronizing UI/debug tools with the final requested vs granted view
 *
 * Protocol expectations:
 * - this is the authoritative event for "what is currently allowed"
 * - `requested` is the normalized declaration baseline known to the host
 * - `granted` is the currently granted subset that authorization checks should follow
 * - plugins should prefer this snapshot over local assumptions when reconciling runtime state
 */
interface ModulePermissionsCurrentEvent {
  granted: ModulePermissionGrant
  identity: ModuleIdentity
  requested: ModulePermissionDeclaration
  revision: number
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
  denied: ModulePermissionDeclaration
  identity: ModuleIdentity
  reason?: string
  revision: number
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
  granted: ModulePermissionGrant
  identity: ModuleIdentity
  revision: number
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
  reason?: string
  requested: ModulePermissionDeclaration
}

interface ModulePreparedEvent {
  identity: ModuleIdentity
  missingDependencies?: ModuleDependency[]
}

interface ModuleStatusChangeEvent {
  details?: Record<string, unknown>
  identity: ModuleIdentity
  phase: ModulePhase
  reason?: string
}

interface ModuleStatusEvent {
  details?: Record<string, unknown>
  identity: ModuleIdentity
  phase: ModulePhase
  reason?: string
}

type OutputGenAiChatCompleteEvent = Partial<WithInputSource<'discord' | 'stage-tamagotchi' | 'stage-web'>> & Partial<WithOutputSource<'gen-ai:chat'>> & {
  message: AssistantMessage
  toolCalls: ToolMessage[]
  usage: OutputGenAiChatUsage
}

type OutputGenAiChatMessageEvent = Partial<WithInputSource<'discord' | 'stage-tamagotchi' | 'stage-web'>> & Partial<WithOutputSource<'gen-ai:chat'>> & {
  message: AssistantMessage
}

type OutputGenAiChatToolCallEvent = Partial<WithInputSource<'discord' | 'stage-tamagotchi' | 'stage-web'>> & Partial<WithOutputSource<'gen-ai:chat'>> & {
  toolCalls: ToolMessage[]
}

interface OutputGenAiChatUsage {
  completionTokens: number
  promptTokens: number
  source: 'estimate-based' | 'provider-based'
  totalTokens: number
}

interface OutputSource {
  'gen-ai:chat': {
    composedMessage: Array<Message>
    contexts: Record<string, ContextUpdate<Record<string, any>, unknown>[]>
    input?: InputEventEnvelope
    message: UserMessage
  }
}

interface PeerAuthenticatedEvent {
  authenticated: boolean
  peerId: string
}

interface PeerAuthenticateEvent {
  peerId?: string
  token?: string
}

interface PeerDeAuthenticatedEvent {
  peerId: string
  reason?: string
}

interface PeerStatusEvent {
  peerId: string
  phase: 'authenticated' | 'closed' | 'connected' | 'de-authenticated' | 'failed'
  reason?: string
}

interface RegistryModulesHealthHealthyEvent {
  identity: MetadataEventSource
  index?: number
  name: string

}

interface RegistryModulesHealthUnhealthyEvent {
  identity: MetadataEventSource
  index?: number
  name: string
  reason?: string
}

interface SparkCommandEvent {
  ack?: string
  commandId: string
  contexts?: Array<ContextUpdate>
  destinations: Array<string>
  eventId?: string
  guidance?: SparkCommandGuidance
  id: string
  intent: 'action' | 'context' | 'pause' | 'plan' | 'proposal' | 'reroute' | 'resume'
  interrupt: 'force' | 'soft' | false
  parentEventId?: string
  priority: 'critical' | 'high' | 'low' | 'normal'
}

interface SparkCommandGuidance {
  options: Array<SparkCommandGuidanceOption>
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
  persona?: Record<string, 'high' | 'low' | 'medium' | 'very-high' | 'very-low'>
  type: 'instruction' | 'memory-recall' | 'proposal'
}

interface SparkCommandGuidanceOption {
  fallback?: Array<string>
  label: string
  possibleOutcome?: Array<string>
  rationale?: string
  risk?: 'high' | 'low' | 'medium' | 'none'
  steps: Array<string>
  triggers?: Array<string>
}

interface SparkEmitEvent {
  destinations: Array<string>
  eventId?: string
  id: string
  metadata?: Record<string, unknown>
  note?: string
  state: 'blocked' | 'done' | 'dropped' | 'expired' | 'queued' | 'working'
}

interface SparkNotifyEvent {
  destinations: Array<string>
  eventId: string
  headline: string
  id: string
  kind: 'alarm' | 'ping' | 'reminder'
  lane?: string
  metadata?: Record<string, unknown>
  note?: string
  payload?: Record<string, unknown>
  requiresAck?: boolean
  ttlMs?: number
  urgency: 'immediate' | 'later' | 'soon'
}

interface TransportConnectionHeartbeatEvent {
  at?: number
  kind: MessageHeartbeatKind
  message: MessageHeartbeat | string
}

interface UiConfigureEvent<C = undefined> {
  config: C | Record<string, unknown>
  moduleIndex?: number
  moduleName: string
}

function defineProtocolEventa<P = undefined>(
  id: string,
  options?: {
    inheritFrom?: ProtocolEventa<P>
    invokeMetadata?: ProtocolEventaInvokeMetadata
    metadata?: ProtocolEventaMetadata
  },
): ProtocolEventa<P> {
  return defineEventa<P, ProtocolEventaMetadata, ProtocolEventaInvokeMetadata>(id, options)
}

export const peerAuthenticate = defineEventa<PeerAuthenticateEvent>('peer:authenticate')
export const peerAuthenticated = defineEventa<PeerAuthenticatedEvent>('peer:authenticated')
export const peerStatus = defineEventa<PeerStatusEvent>('peer:status')
export const peerDeAuthenticated = defineEventa<PeerDeAuthenticatedEvent>('peer:de-authenticated')

export const extensionAuthenticate = defineEventa<ExtensionAuthenticateEvent>('extension:authenticate')
export const extensionAuthenticated = defineEventa<ExtensionAuthenticatedEvent>('extension:authenticated')
export const extensionAnnounce = defineEventa<ExtensionAnnounceEvent>('extension:announce')
export const extensionAnnounced = defineEventa<ExtensionAnnounceEvent>('extension:announced')
export const extensionDeAnnounced = defineEventa<ExtensionAnnounceEvent & { reason?: string }>('extension:de-announced')

export const extensionModuleAnnounce = defineEventa<ExtensionModuleAnnounceEvent>('extension:module:announce')
export const extensionModuleAnnounced = defineEventa<ExtensionModuleAnnounceEvent>('extension:module:announced')
export const extensionModuleDeAnnounced = defineEventa<ExtensionModuleAnnounceEvent & { reason?: string }>('extension:module:de-announced')

export const extensionKitAnnounce = defineEventa<ExtensionKitAnnounceEvent>('extension:kit:announce')
export const extensionKitAnnounced = defineEventa<ExtensionKitAnnounceEvent>('extension:kit:announced')
export const extensionKitDeAnnounced = defineEventa<ExtensionKitAnnounceEvent & { reason?: string }>('extension:kit:de-announced')

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
      group: 'chat-ingestion',
      mode: 'consumer-group',
      selection: 'first',
    },
  },
})
export const inputTextVoice = defineProtocolEventa<WebSocketEventInputTextVoice>('input:text:voice', {
  metadata: {
    delivery: {
      group: 'chat-ingestion',
      mode: 'consumer-group',
      selection: 'first',
    },
  },
})
export const inputVoice = defineProtocolEventa<WebSocketEventInputVoice>('input:voice', {
  metadata: {
    delivery: {
      group: 'chat-ingestion',
      mode: 'consumer-group',
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

export type ProtocolEventOf<E, C = undefined> = E extends keyof ProtocolEvents<C>
  ? Omit<ProtocolEvents<C>[E], 'metadata'> & { metadata?: Record<string, unknown> }
  : never

// Thanks to:
//
// A little hack for creating extensible discriminated unions : r/typescript
// https://www.reddit.com/r/typescript/comments/1064ibt/a_little_hack_for_creating_extensible/
export interface ProtocolEvents<C = undefined> {
  'context:update': ContextUpdateEvent
  'error': ErrorEvent

  'error:permission': ErrorPermissionEvent
  'extension:announce': ExtensionAnnounceEvent
  'extension:announced': ExtensionAnnounceEvent
  'extension:authenticate': ExtensionAuthenticateEvent

  'extension:authenticated': ExtensionAuthenticatedEvent
  'extension:de-announced': ExtensionAnnounceEvent & { reason?: string }
  'extension:kit:announce': ExtensionKitAnnounceEvent
  'extension:kit:announced': ExtensionKitAnnounceEvent
  'extension:kit:de-announced': ExtensionKitAnnounceEvent & { reason?: string }
  'extension:module:announce': ExtensionModuleAnnounceEvent<C>
  'extension:module:announced': ExtensionModuleAnnounceEvent<C>
  'extension:module:de-announced': ExtensionModuleAnnounceEvent<C> & { reason?: string }
  'input:text': WebSocketEventInputText
  'input:text:voice': WebSocketEventInputTextVoice
  'input:voice': WebSocketEventInputVoice

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
  /**
   * Broadcast to all peers when a module successfully announces.
   */
  'module:announced': ModuleAnnouncedEvent
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
   * Module needs configuration to proceed to prepared/configured.
   */
  'module:configuration:needed': ModuleConfigurationNeededEvent<C>
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
  'module:contribute:capability:activated': ModuleContributeCapabilityActivatedEvent
  'module:contribute:capability:configuration:commit': ModuleContributeCapabilityConfigurationCommitEvent<C>
  'module:contribute:capability:configuration:commit:status': ModuleContributeCapabilityConfigurationCommitStatusEvent
  'module:contribute:capability:configuration:configured': ModuleContributeCapabilityConfigurationConfiguredEvent<C>
  /**
   * Capability needs configuration before activation.
   */
  'module:contribute:capability:configuration:needed': ModuleContributeCapabilityConfigurationNeededEvent<C>
  'module:contribute:capability:configuration:plan:request': ModuleContributeCapabilityConfigurationPlanRequestEvent<C>
  'module:contribute:capability:configuration:plan:response': ModuleContributeCapabilityConfigurationPlanResponseEvent<C>
  'module:contribute:capability:configuration:plan:status': ModuleContributeCapabilityConfigurationPlanStatusEvent
  'module:contribute:capability:configuration:validate:request': ModuleContributeCapabilityConfigurationValidateRequestEvent<C>
  'module:contribute:capability:configuration:validate:response': ModuleContributeCapabilityConfigurationValidateResponseEvent<C>
  'module:contribute:capability:configuration:validate:status': ModuleContributeCapabilityConfigurationValidateStatusEvent
  /**
   * Capability offer emitted after module configuration.
   */
  'module:contribute:capability:offer': ModuleContributeCapabilityOfferEvent
  /**
   * Broadcast to all peers when a module is unregistered (disconnect, heartbeat expiry, error, etc).
   */
  'module:de-announced': ModuleDeAnnouncedEvent
  'module:permissions:current': ModulePermissionsCurrentEvent
  'module:permissions:declare': ModulePermissionsDeclareEvent
  'module:permissions:denied': ModulePermissionsDeniedEvent
  'module:permissions:granted': ModulePermissionsGrantedEvent
  'module:permissions:request': ModulePermissionsRequestEvent
  /**
   * Prepare completed. Host can move into config apply/validate.
   *
   * Example:
   *  module:prepared { missingDependencies: [] }
   */
  'module:prepared': ModulePreparedEvent
  /**
   * Lifecycle status updates for orchestration/UX.
   *
   * Example:
   *  module:status { phase: "ready" }
   */
  'module:status': ModuleStatusEvent
  /**
   * Request a phase transition (module → host).
   */
  'module:status:change': ModuleStatusChangeEvent
  'output:gen-ai:chat:complete': OutputGenAiChatCompleteEvent
  'output:gen-ai:chat:message': OutputGenAiChatMessageEvent
  'output:gen-ai:chat:tool-call': OutputGenAiChatToolCallEvent

  'peer:authenticate': PeerAuthenticateEvent

  'peer:authenticated': PeerAuthenticatedEvent
  'peer:de-authenticated': PeerDeAuthenticatedEvent
  'peer:status': PeerStatusEvent

  /**
   * Broadcast when a previously unhealthy module resumes heartbeating (healthy again).
   */
  'registry:modules:health:healthy': RegistryModulesHealthHealthyEvent
  /**
   * Broadcast when a module's heartbeat expires (unhealthy).
   */
  'registry:modules:health:unhealthy': RegistryModulesHealthUnhealthyEvent
  /**
   * Server-side registry sync for known online modules.
   * Sent to newly authenticated peers to bootstrap module discovery.
   */
  'registry:modules:sync': RegistryModulesSyncEvent

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

  'transport:connection:heartbeat': TransportConnectionHeartbeatEvent

  'ui:configure': UiConfigureEvent<C>
}

export function getProtocolEventMetadata(eventType: keyof ProtocolEvents | string) {
  return protocolEventMetadataByType[eventType as keyof typeof protocolEventMetadataByType]
}
