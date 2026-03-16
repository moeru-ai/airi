import * as _moeru_eventa0 from "@moeru/eventa";
import { AssistantMessage, CommonContentPart, Message, ToolMessage, UserMessage } from "@xsai/shared-chat";

//#region src/types/events.d.ts
interface DiscordGuildMember {
  nickname: string;
  displayName: string;
  id: string;
}
interface Discord {
  guildMember?: DiscordGuildMember;
  guildId?: string;
  guildName?: string;
  channelId?: string;
}
interface PluginIdentity {
  /**
   * Stable plugin identifier (shared across instances).
   * Example: "telegram-bot", "stage-tamagotchi".
   */
  id: string;
  /**
   * Optional semantic version for the plugin.
   * Example: "0.8.1-beta.7".
   */
  version?: string;
  /**
   * Optional labels attached to the plugin manifest.
   * Example: { env: "prod", app: "telegram", devtools: "true" }.
   */
  labels?: Record<string, string>;
}
interface ModuleIdentity {
  /**
   * Unique module instance id for this module run (per process/deployment).
   * Example: "telegram-01", "stage-ui-2f7c9".
   */
  id: string;
  /**
   * Module identity kind. For now only plugin-backed modules are supported.
   */
  kind: 'plugin';
  /**
   * Plugin identity associated with this module instance.
   */
  plugin: PluginIdentity;
  /**
   * K8s-style labels for routing and policy selectors.
   * Example: { env: "prod", app: "telegram", devtools: "true" }.
   */
  labels?: Record<string, string>;
}
type MetadataEventSource = ModuleIdentity;
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
interface ModuleConfigSchema {
  id: string;
  version: number;
  /**
   * Optional JSON Schema-like descriptor for tooling/validation.
   * Keep it JSON-serializable and avoid runtime-only values.
   */
  schema?: Record<string, unknown>;
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
interface ModuleDependency {
  /**
   * Logical dependency role (preferred over hard-coded plugin ids).
   * Example: "llm:orchestrator"
   */
  role: string;
  /**
   * Optional dependency flag.
   */
  optional?: boolean;
  /**
   * Version constraint hints.
   */
  version?: string;
  min?: string;
  max?: string;
  /**
   * Additional constraint metadata (JSON-serializable).
   */
  constraints?: Record<string, unknown>;
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
interface ModuleContribution {
  /**
   * Dynamic capabilities exposed by the module.
   */
  capabilities?: string[];
  /**
   * Provider registry contributions (shape defined by the host).
   */
  providers?: Array<Record<string, unknown>>;
  /**
   * UI contribution descriptors (widgets, toolbar items, etc).
   */
  ui?: Record<string, unknown>;
  /**
   * Hook registrations (event handlers, interceptors, etc).
   */
  hooks?: Array<Record<string, unknown>>;
  /**
   * Additional resources or metadata.
   */
  resources?: Record<string, unknown>;
}
/**
 * Lifecycle phases for module orchestration and UX.
 */
type ModulePhase = 'announced' | 'preparing' | 'prepared' | 'configuration-needed' | 'configured' | 'ready' | 'failed';
type Localizable = string | {
  /**
   * Localization key owned by the module.
   * Example: "config.deprecated.model_driver.legacy"
   */
  key: string;
  /**
   * Fallback display string when translation is unavailable.
   */
  fallback?: string;
  /**
   * Params for string interpolation.
   */
  params?: Record<string, string | number | boolean>;
};
interface ModuleConfigNotice {
  /**
   * Machine-friendly key for analytics or client-side mapping.
   */
  code?: string;
  /**
   * Human readable message or localization key.
   */
  message?: Localizable;
  /**
   * JSON pointer or dotted path in config.
   * Example: "driver.legacyModelPath"
   */
  path?: string;
  /**
   * Suggested replacement path or alternative.
   */
  replacedBy?: string;
  /**
   * Version since the notice applies.
   */
  since?: number;
  /**
   * Link to docs or migration guide.
   */
  link?: string;
}
interface ModuleConfigStep {
  /**
   * Suggested action to complete configuration.
   * Use code for UI rendering or message for fallback.
   */
  code?: string;
  message?: Localizable;
  /**
   * Optional targeted field(s).
   */
  paths?: string[];
}
interface ModuleConfigPlan {
  /**
   * Schema that this plan targets.
   */
  schema: ModuleConfigSchema;
  /**
   * Missing required paths for current schema/version.
   */
  missing?: string[];
  /**
   * Invalid fields with reasons (runtime validation result).
   */
  invalid?: Array<{
    path: string;
    reason: string;
  }>;
  /**
   * Recommended defaults computed at runtime (may be environment-specific).
   */
  defaults?: Record<string, unknown>;
  /**
   * Deprecated fields/behaviors detected in current config.
   */
  deprecated?: Array<string | ModuleConfigNotice>;
  /**
   * Suggested migration steps between schema versions.
   */
  migrations?: Array<{
    from: number;
    to: number;
    steps?: Array<string | ModuleConfigStep>;
    notes?: Array<string | ModuleConfigNotice>;
  }>;
  /**
   * Human- or UI-friendly next actions to resolve partial config.
   */
  nextSteps?: Array<string | ModuleConfigStep>;
  /**
   * Non-blocking issues that should be shown to the user/operator.
   */
  warnings?: Array<string | ModuleConfigNotice>;
}
interface ModuleConfigValidation {
  /**
   * Overall validation status.
   *
   * - valid: all required fields present and valid.
   * - partial: config is structurally OK but missing required fields; can be fixed by patches.
   * - invalid: one or more fields are present but invalid (type/range/format); requires correction.
   */
  status: 'partial' | 'valid' | 'invalid';
  /**
   * Missing required fields (only for partial/invalid).
   */
  missing?: string[];
  /**
   * Invalid fields with reasons (only for invalid).
   */
  invalid?: Array<{
    path: string;
    reason: Localizable;
  }>;
  /**
   * Non-blocking issues (e.g., deprecations, best-practice notices).
   */
  warnings?: Array<string | ModuleConfigNotice>;
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
interface ModuleConfigEnvelope<C = Record<string, unknown>> {
  configId: string;
  /**
   * Monotonic revision number for this configId.
   */
  revision: number;
  /**
   * Schema version this config targets.
   */
  schemaVersion: number;
  /**
   * Optional source identity (who produced this config).
   */
  source?: ModuleIdentity;
  /**
   * Full config payload (use when first applying or rehydrating).
   */
  full?: C;
  /**
   * Partial patch payload (use when updating or filling missing fields).
   */
  patch?: Partial<C>;
  /**
   * If patch is used, baseRevision should be set for optimistic concurrency.
   */
  baseRevision?: number;
}
interface ModuleCapability {
  /**
   * Stable capability id within a module.
   * Example: "memory.write", "vision.ocr".
   */
  id: string;
  /**
   * Human-friendly name.
   */
  name?: string;
  /**
   * Optional localized description.
   */
  description?: Localizable;
  /**
   * Capability-specific config schema (if needed).
   */
  configSchema?: ModuleConfigSchema;
  /**
   * Additional metadata for tooling/UI.
   */
  metadata?: Record<string, unknown>;
}
type RouteTargetExpression = {
  type: 'and';
  all: RouteTargetExpression[];
} | {
  type: 'or';
  any: RouteTargetExpression[];
} | {
  type: 'glob';
  glob: string;
  inverted?: boolean;
} | {
  type: 'ids';
  ids: string[];
  inverted?: boolean;
} | {
  type: 'plugin';
  plugins: string[];
  inverted?: boolean;
} | {
  type: 'instance';
  instances: string[];
  inverted?: boolean;
} | {
  type: 'label';
  selectors: string[];
  inverted?: boolean;
} | {
  type: 'module';
  modules: string[];
  inverted?: boolean;
} | {
  type: 'source';
  sources: string[];
  inverted?: boolean;
};
interface RouteConfig {
  destinations?: Array<string | RouteTargetExpression>;
  strategy?: 'broadcast' | 'anycast';
  bypass?: boolean;
}
declare enum MessageHeartbeatKind {
  Ping = "ping",
  Pong = "pong"
}
declare enum MessageHeartbeat {
  Ping = "\uD83E\uDE75",
  Pong = "\uD83D\uDC9B"
}
declare enum WebSocketEventSource {
  Server = "proj-airi:server-runtime",
  StageWeb = "proj-airi:stage-web",
  StageTamagotchi = "proj-airi:stage-tamagotchi"
}
interface InputSource {
  'stage-web': boolean;
  'stage-tamagotchi': boolean;
  'discord': Discord;
}
interface OutputSource {
  'gen-ai:chat': {
    message: UserMessage;
    contexts: Record<string, ContextUpdate<Record<string, any>, string | CommonContentPart[]>[]>;
    composedMessage: Array<Message>;
    input?: InputEventEnvelope;
  };
}
declare enum ContextUpdateStrategy {
  ReplaceSelf = "replace-self",
  AppendSelf = "append-self"
}
interface ContextUpdateDestinationAll {
  all: true;
}
interface ContextUpdateDestinationList {
  include?: Array<string>;
  exclude?: Array<string>;
}
type ContextUpdateDestinationFilter = ContextUpdateDestinationAll | ContextUpdateDestinationList;
interface ContextUpdate<Metadata extends Record<string, any> = Record<string, unknown>, Content extends any = undefined> {
  id: string;
  /**
   * Can be the same if same update sends multiple time as attempts
   * and trials, (e.g. notified first but not ACKed, then retried).
   */
  contextId: string;
  lane?: string;
  ideas?: Array<string>;
  hints?: Array<string>;
  strategy: ContextUpdateStrategy;
  text: string;
  content?: Content;
  destinations?: Array<string> | ContextUpdateDestinationFilter;
  metadata?: Metadata;
}
interface InputMessageOverrides {
  sessionId?: string;
  messagePrefix?: string;
}
type InputContextUpdate = Omit<ContextUpdate<Record<string, unknown>, string | CommonContentPart[]>, 'id' | 'contextId'> & Partial<Pick<ContextUpdate<Record<string, unknown>, string | CommonContentPart[]>, 'id' | 'contextId'>>;
interface WebSocketEventInputTextBase {
  text: string;
  textRaw?: string;
  sourceTags?: string[];
  qq?: unknown;
  overrides?: InputMessageOverrides;
  contextUpdates?: InputContextUpdate[];
}
type WebSocketEventInputText = WebSocketEventInputTextBase & Partial<WithInputSource<'stage-web' | 'stage-tamagotchi' | 'discord'>>;
interface WebSocketEventInputTextVoiceBase {
  transcription: string;
  textRaw?: string;
  overrides?: InputMessageOverrides;
  contextUpdates?: InputContextUpdate[];
}
type WebSocketEventInputTextVoice = WebSocketEventInputTextVoiceBase & Partial<WithInputSource<'stage-web' | 'stage-tamagotchi' | 'discord'>>;
interface WebSocketEventInputVoiceBase {
  audio: ArrayBuffer;
  overrides?: InputMessageOverrides;
  contextUpdates?: InputContextUpdate[];
}
type WebSocketEventInputVoice = WebSocketEventInputVoiceBase & Partial<WithInputSource<'stage-web' | 'stage-tamagotchi' | 'discord'>>;
type InputEventData = WebSocketEventInputText | WebSocketEventInputTextVoice | WebSocketEventInputVoice;
type InputEventEnvelope = {
  type: 'input:text';
  data: WebSocketEventInputText;
} | {
  type: 'input:text:voice';
  data: WebSocketEventInputTextVoice;
} | {
  type: 'input:voice';
  data: WebSocketEventInputVoice;
};
interface EventBaseMetadata {
  source?: ModuleIdentity;
  event?: {
    id?: string;
    parentId?: string;
  };
}
type WithInputSource<Source extends keyof InputSource> = { [S in Source]: InputSource[S] };
type WithOutputSource<Source extends keyof OutputSource> = { [S in Source]: OutputSource[S] };
interface ModuleAuthenticateEvent {
  token: string;
}
interface ModuleAuthenticatedEvent {
  authenticated: boolean;
}
interface ModuleCompatibilityRequestEvent {
  protocolVersion: string;
  apiVersion: string;
  supportedProtocolVersions?: string[];
  supportedApiVersions?: string[];
}
interface ModuleCompatibilityResultEvent {
  protocolVersion: string;
  apiVersion: string;
  mode: 'exact' | 'downgraded' | 'rejected';
  reason?: string;
}
interface RegistryModulesSyncEvent {
  modules: Array<{
    name: string;
    index?: number;
    identity: ModuleIdentity;
  }>;
}
interface ErrorEvent {
  message: string;
}
interface ModuleAnnounceEvent<C = undefined> {
  name: string;
  identity: ModuleIdentity;
  possibleEvents: Array<(keyof ProtocolEvents<C>)>;
  configSchema?: ModuleConfigSchema;
  dependencies?: ModuleDependency[];
}
interface ModuleAnnouncedEvent {
  name: string;
  index?: number;
  identity: ModuleIdentity;
}
interface ModuleDeAnnouncedEvent {
  name: string;
  index?: number;
  identity: ModuleIdentity;
  reason?: string;
}
interface RegistryModulesHealthUnhealthyEvent {
  name: string;
  index?: number;
  identity: ModuleIdentity;
  reason?: string;
}
interface RegistryModulesHealthHealthyEvent {
  name: string;
  index?: number;
  identity: ModuleIdentity;
}
interface ModulePreparedEvent {
  identity: ModuleIdentity;
  missingDependencies?: ModuleDependency[];
}
interface ModuleConfigurationNeededEvent<C = undefined> {
  identity: ModuleIdentity;
  schema?: ModuleConfigSchema;
  current?: ModuleConfigEnvelope<C>;
  reason?: string;
}
interface ModuleStatusEvent {
  identity: ModuleIdentity;
  phase: ModulePhase;
  reason?: string;
  details?: Record<string, unknown>;
}
interface ModuleConfigurationValidateRequestEvent<C = undefined> {
  identity: ModuleIdentity;
  current?: ModuleConfigEnvelope<C>;
}
interface ModuleConfigurationValidateResponseEvent<C = undefined> {
  identity: ModuleIdentity;
  validation: ModuleConfigValidation;
  plan?: ModuleConfigPlan;
  current?: ModuleConfigEnvelope<C>;
}
interface ModuleConfigurationValidateStatusEvent {
  identity: ModuleIdentity;
  state: 'queued' | 'working' | 'done' | 'failed';
  note?: string;
  progress?: number;
}
interface ModuleConfigurationPlanRequestEvent<C = undefined> {
  identity: ModuleIdentity;
  plan?: ModuleConfigPlan;
  current?: ModuleConfigEnvelope<C>;
}
interface ModuleConfigurationPlanResponseEvent<C = undefined> {
  identity: ModuleIdentity;
  plan: ModuleConfigPlan;
  current?: ModuleConfigEnvelope<C>;
}
interface ModuleConfigurationPlanStatusEvent {
  identity: ModuleIdentity;
  state: 'queued' | 'working' | 'done' | 'failed';
  note?: string;
  progress?: number;
}
interface ModuleConfigurationCommitEvent<C = undefined> {
  identity: ModuleIdentity;
  config: ModuleConfigEnvelope<C>;
}
interface ModuleConfigurationCommitStatusEvent {
  identity: ModuleIdentity;
  state: 'queued' | 'working' | 'done' | 'failed';
  note?: string;
  progress?: number;
}
interface ModuleConfigurationConfiguredEvent<C = undefined> {
  identity: ModuleIdentity;
  config: ModuleConfigEnvelope<C>;
}
interface ModuleContributeCapabilityOfferEvent {
  identity: ModuleIdentity;
  capability: ModuleCapability;
}
interface ModuleContributeCapabilityConfigurationNeededEvent<C = undefined> {
  identity: ModuleIdentity;
  capabilityId: string;
  schema?: ModuleConfigSchema;
  current?: ModuleConfigEnvelope<C>;
  reason?: string;
}
interface ModuleContributeCapabilityConfigurationValidateRequestEvent<C = undefined> {
  identity: ModuleIdentity;
  capabilityId: string;
  current?: ModuleConfigEnvelope<C>;
}
interface ModuleContributeCapabilityConfigurationValidateResponseEvent<C = undefined> {
  identity: ModuleIdentity;
  capabilityId: string;
  validation: ModuleConfigValidation;
  plan?: ModuleConfigPlan;
  current?: ModuleConfigEnvelope<C>;
}
interface ModuleContributeCapabilityConfigurationValidateStatusEvent {
  identity: ModuleIdentity;
  capabilityId: string;
  state: 'queued' | 'working' | 'done' | 'failed';
  note?: string;
  progress?: number;
}
interface ModuleContributeCapabilityConfigurationPlanRequestEvent<C = undefined> {
  identity: ModuleIdentity;
  capabilityId: string;
  plan?: ModuleConfigPlan;
  current?: ModuleConfigEnvelope<C>;
}
interface ModuleContributeCapabilityConfigurationPlanResponseEvent<C = undefined> {
  identity: ModuleIdentity;
  capabilityId: string;
  plan: ModuleConfigPlan;
  current?: ModuleConfigEnvelope<C>;
}
interface ModuleContributeCapabilityConfigurationPlanStatusEvent {
  identity: ModuleIdentity;
  capabilityId: string;
  state: 'queued' | 'working' | 'done' | 'failed';
  note?: string;
  progress?: number;
}
interface ModuleContributeCapabilityConfigurationCommitEvent<C = undefined> {
  identity: ModuleIdentity;
  capabilityId: string;
  config: ModuleConfigEnvelope<C>;
}
interface ModuleContributeCapabilityConfigurationCommitStatusEvent {
  identity: ModuleIdentity;
  capabilityId: string;
  state: 'queued' | 'working' | 'done' | 'failed';
  note?: string;
  progress?: number;
}
interface ModuleContributeCapabilityConfigurationConfiguredEvent<C = undefined> {
  identity: ModuleIdentity;
  capabilityId: string;
  config: ModuleConfigEnvelope<C>;
}
interface ModuleContributeCapabilityActivatedEvent {
  identity: ModuleIdentity;
  capabilityId: string;
  active: boolean;
  reason?: string;
}
interface ModuleStatusChangeEvent {
  identity: ModuleIdentity;
  phase: ModulePhase;
  reason?: string;
  details?: Record<string, unknown>;
}
interface ModuleConfigureEvent<C = undefined> {
  config: C | Record<string, unknown>;
}
interface UiConfigureEvent<C = undefined> {
  moduleName: string;
  moduleIndex?: number;
  config: C | Record<string, unknown>;
}
type OutputGenAiChatToolCallEvent = {
  toolCalls: ToolMessage[];
} & Partial<WithInputSource<'stage-web' | 'stage-tamagotchi' | 'discord'>> & Partial<WithOutputSource<'gen-ai:chat'>>;
type OutputGenAiChatMessageEvent = {
  message: AssistantMessage;
} & Partial<WithInputSource<'stage-web' | 'stage-tamagotchi' | 'discord'>> & Partial<WithOutputSource<'gen-ai:chat'>>;
interface OutputGenAiChatUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  source: 'provider-based' | 'estimate-based';
}
type OutputGenAiChatCompleteEvent = {
  message: AssistantMessage;
  toolCalls: ToolMessage[];
  usage: OutputGenAiChatUsage;
} & Partial<WithInputSource<'stage-web' | 'stage-tamagotchi' | 'discord'>> & Partial<WithOutputSource<'gen-ai:chat'>>;
interface SparkNotifyEvent {
  id: string;
  eventId: string;
  lane?: string;
  kind: 'alarm' | 'ping' | 'reminder';
  urgency: 'immediate' | 'soon' | 'later';
  headline: string;
  note?: string;
  payload?: Record<string, unknown>;
  ttlMs?: number;
  requiresAck?: boolean;
  destinations: Array<string>;
  metadata?: Record<string, unknown>;
}
interface SparkEmitEvent {
  id: string;
  eventId?: string;
  state: 'queued' | 'working' | 'done' | 'dropped' | 'blocked' | 'expired';
  note?: string;
  destinations: Array<string>;
  metadata?: Record<string, unknown>;
}
interface SparkCommandGuidanceOption {
  label: string;
  steps: Array<string>;
  rationale?: string;
  possibleOutcome?: Array<string>;
  risk?: 'high' | 'medium' | 'low' | 'none';
  fallback?: Array<string>;
  triggers?: Array<string>;
}
interface SparkCommandGuidance {
  type: 'proposal' | 'instruction' | 'memory-recall';
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
  persona?: Record<string, 'very-high' | 'high' | 'medium' | 'low' | 'very-low'>;
  options: Array<SparkCommandGuidanceOption>;
}
interface SparkCommandEvent {
  id: string;
  eventId?: string;
  parentEventId?: string;
  commandId: string;
  interrupt: 'force' | 'soft' | false;
  priority: 'critical' | 'high' | 'normal' | 'low';
  intent: 'plan' | 'proposal' | 'action' | 'pause' | 'resume' | 'reroute' | 'context';
  ack?: string;
  guidance?: SparkCommandGuidance;
  contexts?: Array<ContextUpdate>;
  destinations: Array<string>;
}
interface TransportConnectionHeartbeatEvent {
  kind: MessageHeartbeatKind;
  message: MessageHeartbeat | string;
  at?: number;
}
type ContextUpdateEvent = ContextUpdate;
declare const moduleAuthenticate: _moeru_eventa0.Eventa<ModuleAuthenticateEvent>;
declare const moduleAuthenticated: _moeru_eventa0.Eventa<ModuleAuthenticatedEvent>;
declare const moduleCompatibilityRequest: _moeru_eventa0.Eventa<ModuleCompatibilityRequestEvent>;
declare const moduleCompatibilityResult: _moeru_eventa0.Eventa<ModuleCompatibilityResultEvent>;
declare const registryModulesSync: _moeru_eventa0.Eventa<RegistryModulesSyncEvent>;
declare const registryModulesHealthUnhealthy: _moeru_eventa0.Eventa<RegistryModulesHealthUnhealthyEvent>;
declare const registryModulesHealthHealthy: _moeru_eventa0.Eventa<RegistryModulesHealthHealthyEvent>;
declare const error: _moeru_eventa0.Eventa<ErrorEvent>;
declare const moduleAnnounce: _moeru_eventa0.Eventa<ModuleAnnounceEvent<undefined>>;
declare const moduleAnnounced: _moeru_eventa0.Eventa<ModuleAnnouncedEvent>;
declare const moduleDeAnnounced: _moeru_eventa0.Eventa<ModuleDeAnnouncedEvent>;
declare const modulePrepared: _moeru_eventa0.Eventa<ModulePreparedEvent>;
declare const moduleConfigurationNeeded: _moeru_eventa0.Eventa<ModuleConfigurationNeededEvent<undefined>>;
declare const moduleStatus: _moeru_eventa0.Eventa<ModuleStatusEvent>;
declare const moduleConfigurationValidateRequest: _moeru_eventa0.Eventa<ModuleConfigurationValidateRequestEvent<undefined>>;
declare const moduleConfigurationValidateResponse: _moeru_eventa0.Eventa<ModuleConfigurationValidateResponseEvent<undefined>>;
declare const moduleConfigurationValidateStatus: _moeru_eventa0.Eventa<ModuleConfigurationValidateStatusEvent>;
declare const moduleConfigurationPlanRequest: _moeru_eventa0.Eventa<ModuleConfigurationPlanRequestEvent<undefined>>;
declare const moduleConfigurationPlanResponse: _moeru_eventa0.Eventa<ModuleConfigurationPlanResponseEvent<undefined>>;
declare const moduleConfigurationPlanStatus: _moeru_eventa0.Eventa<ModuleConfigurationPlanStatusEvent>;
declare const moduleConfigurationCommit: _moeru_eventa0.Eventa<ModuleConfigurationCommitEvent<undefined>>;
declare const moduleConfigurationCommitStatus: _moeru_eventa0.Eventa<ModuleConfigurationCommitStatusEvent>;
declare const moduleConfigurationConfigured: _moeru_eventa0.Eventa<ModuleConfigurationConfiguredEvent<undefined>>;
declare const moduleContributeCapabilityOffer: _moeru_eventa0.Eventa<ModuleContributeCapabilityOfferEvent>;
declare const moduleContributeCapabilityConfigurationNeeded: _moeru_eventa0.Eventa<ModuleContributeCapabilityConfigurationNeededEvent<undefined>>;
declare const moduleContributeCapabilityConfigurationValidateRequest: _moeru_eventa0.Eventa<ModuleContributeCapabilityConfigurationValidateRequestEvent<undefined>>;
declare const moduleContributeCapabilityConfigurationValidateResponse: _moeru_eventa0.Eventa<ModuleContributeCapabilityConfigurationValidateResponseEvent<undefined>>;
declare const moduleContributeCapabilityConfigurationValidateStatus: _moeru_eventa0.Eventa<ModuleContributeCapabilityConfigurationValidateStatusEvent>;
declare const moduleContributeCapabilityConfigurationPlanRequest: _moeru_eventa0.Eventa<ModuleContributeCapabilityConfigurationPlanRequestEvent<undefined>>;
declare const moduleContributeCapabilityConfigurationPlanResponse: _moeru_eventa0.Eventa<ModuleContributeCapabilityConfigurationPlanResponseEvent<undefined>>;
declare const moduleContributeCapabilityConfigurationPlanStatus: _moeru_eventa0.Eventa<ModuleContributeCapabilityConfigurationPlanStatusEvent>;
declare const moduleContributeCapabilityConfigurationCommit: _moeru_eventa0.Eventa<ModuleContributeCapabilityConfigurationCommitEvent<undefined>>;
declare const moduleContributeCapabilityConfigurationCommitStatus: _moeru_eventa0.Eventa<ModuleContributeCapabilityConfigurationCommitStatusEvent>;
declare const moduleContributeCapabilityConfigurationConfigured: _moeru_eventa0.Eventa<ModuleContributeCapabilityConfigurationConfiguredEvent<undefined>>;
declare const moduleContributeCapabilityActivated: _moeru_eventa0.Eventa<ModuleContributeCapabilityActivatedEvent>;
declare const moduleStatusChange: _moeru_eventa0.Eventa<ModuleStatusChangeEvent>;
declare const moduleConfigure: _moeru_eventa0.Eventa<ModuleConfigureEvent<undefined>>;
declare const uiConfigure: _moeru_eventa0.Eventa<UiConfigureEvent<undefined>>;
declare const inputText: _moeru_eventa0.Eventa<WebSocketEventInputText>;
declare const inputTextVoice: _moeru_eventa0.Eventa<WebSocketEventInputTextVoice>;
declare const inputVoice: _moeru_eventa0.Eventa<WebSocketEventInputVoice>;
declare const outputGenAiChatToolCall: _moeru_eventa0.Eventa<OutputGenAiChatToolCallEvent>;
declare const outputGenAiChatMessage: _moeru_eventa0.Eventa<OutputGenAiChatMessageEvent>;
declare const outputGenAiChatComplete: _moeru_eventa0.Eventa<OutputGenAiChatCompleteEvent>;
declare const sparkNotify: _moeru_eventa0.Eventa<SparkNotifyEvent>;
declare const sparkEmit: _moeru_eventa0.Eventa<SparkEmitEvent>;
declare const sparkCommand: _moeru_eventa0.Eventa<SparkCommandEvent>;
declare const transportConnectionHeartbeat: _moeru_eventa0.Eventa<TransportConnectionHeartbeatEvent>;
declare const contextUpdate: _moeru_eventa0.Eventa<ContextUpdateEvent>;
interface ProtocolEvents<C = undefined> {
  'error': ErrorEvent;
  'module:authenticate': ModuleAuthenticateEvent;
  'module:authenticated': ModuleAuthenticatedEvent;
  /**
   * Plugin asks host to negotiate protocol + API compatibility.
   */
  'module:compatibility:request': ModuleCompatibilityRequestEvent;
  /**
   * Host replies with accepted mode/result for protocol + API compatibility.
   */
  'module:compatibility:result': ModuleCompatibilityResultEvent;
  /**
   * Server-side registry sync for known online modules.
   * Sent to newly authenticated peers to bootstrap module discovery.
   */
  'registry:modules:sync': RegistryModulesSyncEvent;
  /**
   * Broadcast when a module's heartbeat expires (unhealthy).
   */
  'registry:modules:health:unhealthy': RegistryModulesHealthUnhealthyEvent;
  /**
   * Broadcast when a previously unhealthy module resumes heartbeating (healthy again).
   */
  'registry:modules:health:healthy': RegistryModulesHealthHealthyEvent;
  /**
   * Broadcast to all peers when a module announces itself, with its identity, static metadata, and declared dependencies.
   * Host can use this to decide when to prepare/configure modules based on their needs and capabilities.
   * Module that registering self can use this to declare its presence and what it offers, and to trigger orchestration flows in the host or other modules.
   *
   *
   * NOTICE: Modules that would love to discover peers SHOULD NOT wait or listen to this event, instead
   * module:announced or module:de-announced, or registry:modules:sync and registry:modules:health:* events for more reliable discovery and tracking.
   */
  'module:announce': ModuleAnnounceEvent<C>;
  /**
   * Broadcast to all peers when a module successfully announces.
   */
  'module:announced': ModuleAnnouncedEvent;
  /**
   * Broadcast to all peers when a module is unregistered (disconnect, heartbeat expiry, error, etc).
   */
  'module:de-announced': ModuleDeAnnouncedEvent;
  /**
   * Prepare completed. Host can move into config apply/validate.
   *
   * Example:
   *  module:prepared { missingDependencies: [] }
   */
  'module:prepared': ModulePreparedEvent;
  /**
   * Module needs configuration to proceed to prepared/configured.
   */
  'module:configuration:needed': ModuleConfigurationNeededEvent<C>;
  /**
   * Lifecycle status updates for orchestration/UX.
   *
   * Example:
   *  module:status { phase: "ready" }
   */
  'module:status': ModuleStatusEvent;
  /**
   * Ask the module to validate current config (host → module).
   */
  'module:configuration:validate:request': ModuleConfigurationValidateRequestEvent<C>;
  /**
   * Validation response (module → host), with optional plan suggestions.
   */
  'module:configuration:validate:response': ModuleConfigurationValidateResponseEvent<C>;
  /**
   * Status updates for validation (module → host).
   */
  'module:configuration:validate:status': ModuleConfigurationValidateStatusEvent;
  /**
   * Configuration planning request (host → module).
   */
  'module:configuration:plan:request': ModuleConfigurationPlanRequestEvent<C>;
  /**
   * Configuration planning response (module → host).
   */
  'module:configuration:plan:response': ModuleConfigurationPlanResponseEvent<C>;
  /**
   * Status updates for planning (module → host).
   */
  'module:configuration:plan:status': ModuleConfigurationPlanStatusEvent;
  /**
   * Commit a config as "active" (host → module).
   */
  'module:configuration:commit': ModuleConfigurationCommitEvent<C>;
  /**
   * Status updates for commit (module → host).
   */
  'module:configuration:commit:status': ModuleConfigurationCommitStatusEvent;
  /**
   * Configuration fully applied and active (module → host).
   */
  'module:configuration:configured': ModuleConfigurationConfiguredEvent<C>;
  /**
   * Capability offer emitted after module configuration.
   */
  'module:contribute:capability:offer': ModuleContributeCapabilityOfferEvent;
  /**
   * Capability needs configuration before activation.
   */
  'module:contribute:capability:configuration:needed': ModuleContributeCapabilityConfigurationNeededEvent<C>;
  'module:contribute:capability:configuration:validate:request': ModuleContributeCapabilityConfigurationValidateRequestEvent<C>;
  'module:contribute:capability:configuration:validate:response': ModuleContributeCapabilityConfigurationValidateResponseEvent<C>;
  'module:contribute:capability:configuration:validate:status': ModuleContributeCapabilityConfigurationValidateStatusEvent;
  'module:contribute:capability:configuration:plan:request': ModuleContributeCapabilityConfigurationPlanRequestEvent<C>;
  'module:contribute:capability:configuration:plan:response': ModuleContributeCapabilityConfigurationPlanResponseEvent<C>;
  'module:contribute:capability:configuration:plan:status': ModuleContributeCapabilityConfigurationPlanStatusEvent;
  'module:contribute:capability:configuration:commit': ModuleContributeCapabilityConfigurationCommitEvent<C>;
  'module:contribute:capability:configuration:commit:status': ModuleContributeCapabilityConfigurationCommitStatusEvent;
  'module:contribute:capability:configuration:configured': ModuleContributeCapabilityConfigurationConfiguredEvent<C>;
  'module:contribute:capability:activated': ModuleContributeCapabilityActivatedEvent;
  /**
   * Request a phase transition (module → host).
   */
  'module:status:change': ModuleStatusChangeEvent;
  /**
   * Push configuration down to module (host → module).
   */
  'module:configure': ModuleConfigureEvent<C>;
  'ui:configure': UiConfigureEvent<C>;
  'input:text': WebSocketEventInputText;
  'input:text:voice': WebSocketEventInputTextVoice;
  'input:voice': WebSocketEventInputVoice;
  'output:gen-ai:chat:tool-call': OutputGenAiChatToolCallEvent;
  'output:gen-ai:chat:message': OutputGenAiChatMessageEvent;
  'output:gen-ai:chat:complete': OutputGenAiChatCompleteEvent;
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
  'spark:notify': SparkNotifyEvent;
  /**
   * Acknowledgement/progress/state for a spark or command (bidirectional).
   * Examples:
   * - Character: state=working, note="Seen it, responding".
   * - Sub-agent: state=done, note="Healed and safe".
   * - Sub-agent: state=blocked/dropped with note when it cannot comply.
   * - Minecraft: state=working, note="Pillared up; healing" in reply to a command.
   */
  'spark:emit': SparkEmitEvent;
  /**
   * Character issues instructions or context to a sub-agent.
   * interrupt: force = hard preempt; soft = merge/queue.
   * Examples:
   * - Witch attack: interrupt=force, priority=critical, intent=action with options (aggressive/cautious).
   *   e.g., options to block/retreat vs push with shield/sword, with fallback steps.
   * - Prep plan: interrupt=soft, priority=high, intent=plan with steps/fallbacks.
   * - Contextual hints: intent=context with contextPatch ideas/hints.
   */
  'spark:command': SparkCommandEvent;
  'transport:connection:heartbeat': TransportConnectionHeartbeatEvent;
  'context:update': ContextUpdateEvent;
}
type ProtocolEventOf<E, C = undefined> = E extends keyof ProtocolEvents<C> ? Omit<ProtocolEvents<C>[E], 'metadata'> & {
  metadata?: Record<string, unknown>;
} : never;
//#endregion
export { ContextUpdate, ContextUpdateDestinationAll, ContextUpdateDestinationFilter, ContextUpdateDestinationList, ContextUpdateStrategy, Discord, DiscordGuildMember, EventBaseMetadata, InputContextUpdate, InputEventData, InputEventEnvelope, InputMessageOverrides, Localizable, MessageHeartbeat, MessageHeartbeatKind, MetadataEventSource, ModuleCapability, ModuleConfigEnvelope, ModuleConfigNotice, ModuleConfigPlan, ModuleConfigSchema, ModuleConfigStep, ModuleConfigValidation, ModuleContribution, ModuleDependency, ModuleIdentity, ModulePhase, PluginIdentity, ProtocolEventOf, ProtocolEvents, RouteConfig, RouteTargetExpression, WebSocketEventInputText, WebSocketEventInputTextBase, WebSocketEventInputTextVoice, WebSocketEventInputTextVoiceBase, WebSocketEventInputVoice, WebSocketEventInputVoiceBase, WebSocketEventSource, WithInputSource, WithOutputSource, contextUpdate, error, inputText, inputTextVoice, inputVoice, moduleAnnounce, moduleAnnounced, moduleAuthenticate, moduleAuthenticated, moduleCompatibilityRequest, moduleCompatibilityResult, moduleConfigurationCommit, moduleConfigurationCommitStatus, moduleConfigurationConfigured, moduleConfigurationNeeded, moduleConfigurationPlanRequest, moduleConfigurationPlanResponse, moduleConfigurationPlanStatus, moduleConfigurationValidateRequest, moduleConfigurationValidateResponse, moduleConfigurationValidateStatus, moduleConfigure, moduleContributeCapabilityActivated, moduleContributeCapabilityConfigurationCommit, moduleContributeCapabilityConfigurationCommitStatus, moduleContributeCapabilityConfigurationConfigured, moduleContributeCapabilityConfigurationNeeded, moduleContributeCapabilityConfigurationPlanRequest, moduleContributeCapabilityConfigurationPlanResponse, moduleContributeCapabilityConfigurationPlanStatus, moduleContributeCapabilityConfigurationValidateRequest, moduleContributeCapabilityConfigurationValidateResponse, moduleContributeCapabilityConfigurationValidateStatus, moduleContributeCapabilityOffer, moduleDeAnnounced, modulePrepared, moduleStatus, moduleStatusChange, outputGenAiChatComplete, outputGenAiChatMessage, outputGenAiChatToolCall, registryModulesHealthHealthy, registryModulesHealthUnhealthy, registryModulesSync, sparkCommand, sparkEmit, sparkNotify, transportConnectionHeartbeat, uiConfigure };
//# sourceMappingURL=index.d.mts.map