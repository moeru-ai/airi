import { createPluginContext } from "./plugin-host/runtimes/node/index.mjs";
import { EventContext, createContext } from "@moeru/eventa";
import { ModuleConfigEnvelope, ModuleIdentity, ModulePhase, PluginIdentity, ProtocolEvents } from "@proj-airi/plugin-protocol/types";
import * as valibot from "valibot";
import * as xstate from "xstate";
import { ActorRefFrom } from "xstate";
import * as node_worker_threads0 from "node:worker_threads";

//#region src/plugin/apis/client/index.d.ts
declare function createApis(ctx: EventContext<any, any>): {
  providers: {
    listProviders(): Promise<{
      name: string;
    }[]>;
  };
};
type PluginApis = ReturnType<typeof createApis>;
//#endregion
//#region src/plugin/apis/protocol/capabilities/index.d.ts
interface CapabilityDescriptor {
  key: string;
  state: 'announced' | 'ready' | 'degraded' | 'withdrawn';
  metadata?: Record<string, unknown>;
  updatedAt: number;
}
//#endregion
//#region src/channels/shared.d.ts
type ChannelHost = ReturnType<typeof createContext>;
//#endregion
//#region src/plugin/shared.d.ts
interface ContextInit {
  channels: {
    host: ChannelHost;
  };
  apis: PluginApis;
}
interface Plugin {
  /**
   *
   */
  init?: (initContext: ContextInit) => Promise<void | undefined | false>;
  /**
   *
   */
  setupModules?: (initContext: ContextInit) => Promise<void | undefined>;
}
//#endregion
//#region src/plugin-host/transports/index.d.ts
type PluginTransport = {
  kind: 'in-memory';
} | {
  kind: 'websocket';
  url: string;
  protocols?: string[];
} | {
  kind: 'web-worker';
  worker: Worker;
} | {
  kind: 'node-worker';
  worker: node_worker_threads0.Worker;
} | {
  kind: 'electron';
  target: 'main' | 'renderer';
  webContentsId?: number;
};
//#endregion
//#region src/plugin-host/core.d.ts
declare const pluginLifecycleMachine: xstate.StateMachine<xstate.MachineContext, xstate.AnyEventObject, Record<string, xstate.AnyActorRef>, xstate.ProvidedActor, xstate.ParameterizedObject, xstate.ParameterizedObject, string, xstate.StateValue, string, unknown, {}, xstate.EventObject, xstate.MetaObject, any>;
type PluginRuntime = 'electron' | 'node' | 'web';
type ModulePhase$1 = ModulePhase;
type PluginSessionPhase = 'loading' | 'loaded' | 'authenticating' | 'authenticated' | 'waiting-deps' | ModulePhase$1 | 'stopped';
type PluginIdentity$1 = PluginIdentity;
type ModuleIdentity$1 = ModuleIdentity;
type ModuleConfigEnvelope$1<C = Record<string, unknown>> = ModuleConfigEnvelope<C>;
type ModuleCompatibilityRequest = ProtocolEvents['module:compatibility:request'];
type ModuleCompatibilityResult = ProtocolEvents['module:compatibility:result'];
interface ManifestV1 {
  apiVersion: 'v1';
  kind: 'manifest.plugin.airi.moeru.ai';
  name: string;
  entrypoints: {
    default?: string;
    electron?: string;
    node?: string;
    web?: string;
  };
}
declare const manifestV1Schema: valibot.ObjectSchema<{
  readonly apiVersion: valibot.LiteralSchema<"v1", undefined>;
  readonly kind: valibot.LiteralSchema<"manifest.plugin.airi.moeru.ai", undefined>;
  readonly name: valibot.StringSchema<undefined>;
  readonly entrypoints: valibot.ObjectSchema<{
    readonly default: valibot.OptionalSchema<valibot.StringSchema<undefined>, undefined>;
    readonly electron: valibot.OptionalSchema<valibot.StringSchema<undefined>, undefined>;
    readonly node: valibot.OptionalSchema<valibot.StringSchema<undefined>, undefined>;
    readonly web: valibot.OptionalSchema<valibot.StringSchema<undefined>, undefined>;
  }, undefined>;
}, undefined>;
interface PluginLoadOptions {
  cwd?: string;
  runtime?: PluginRuntime;
}
interface PluginHostOptions {
  runtime?: PluginRuntime;
  transport?: PluginTransport;
  protocolVersion?: string;
  apiVersion?: string;
  supportedProtocolVersions?: string[];
  supportedApiVersions?: string[];
}
interface PluginStartOptions {
  cwd?: string;
  runtime?: PluginRuntime;
  requireConfiguration?: boolean;
  compatibility?: Omit<ModuleCompatibilityRequest, 'protocolVersion' | 'apiVersion'>;
  requiredCapabilities?: string[];
  capabilityWaitTimeoutMs?: number;
}
interface PluginHostSession {
  manifest: ManifestV1;
  plugin: Plugin;
  id: string;
  index: number;
  cwd: string;
  identity: ModuleIdentity$1;
  phase: PluginSessionPhase;
  lifecycle: ActorRefFrom<typeof pluginLifecycleMachine>;
  transport: PluginTransport;
  runtime: PluginRuntime;
  channels: {
    host: ReturnType<typeof createPluginContext>;
  };
  apis: ReturnType<typeof createApis>;
}
/**
 * In-memory Plugin Host MVP.
 *
 * Procedure placement:
 * - `load(...)` covers step 0 and step 1 preparation:
 *   - create channel gateway/context
 *   - prepare per-plugin isolated runtime resources
 *   - load plugin module from manifest entrypoint
 * - `init(...)` covers protocol/lifecycle step 2 onwards:
 *   - authentication
 *   - compatibility negotiation
 *   - registry sync + announce/prepare/configure/ready flow
 *
 * The design intentionally keeps `load` and `init` separate so callers can:
 * - inspect/patch session state before booting,
 * - batch-load many plugins first, then initialize deterministically.
 */
declare class PluginHost {
  private readonly loader;
  private readonly sessions;
  private readonly runtime;
  private readonly transport;
  private readonly protocolVersion;
  private readonly apiVersion;
  private readonly supportedProtocolVersions;
  private readonly supportedApiVersions;
  private readonly capabilities;
  private readonly capabilityWaiters;
  private providersListResolver;
  private sessionCounter;
  constructor(options?: PluginHostOptions);
  listSessions(): PluginHostSession[];
  getSession(sessionId: string): PluginHostSession;
  load(manifest: ManifestV1, options?: PluginLoadOptions): Promise<PluginHostSession>;
  init(sessionId: string, options?: PluginStartOptions): Promise<PluginHostSession>;
  start(manifest: ManifestV1, options?: PluginStartOptions): Promise<PluginHostSession>;
  applyConfiguration(sessionId: string, config: ModuleConfigEnvelope$1): Promise<PluginHostSession>;
  setProvidersListResolver(resolver: () => Promise<Array<{
    name: string;
  }>> | Array<{
    name: string;
  }>): void;
  announceCapability(key: string, metadata?: Record<string, unknown>): CapabilityDescriptor;
  markCapabilityReady(key: string, metadata?: Record<string, unknown>): CapabilityDescriptor;
  markCapabilityDegraded(key: string, metadata?: Record<string, unknown>): CapabilityDescriptor;
  withdrawCapability(key: string, metadata?: Record<string, unknown>): CapabilityDescriptor;
  listCapabilities(): CapabilityDescriptor[];
  isCapabilityReady(key: string): boolean;
  waitForCapabilities(keys: string[], timeoutMs?: number): Promise<void>;
  waitForCapability(key: string, timeoutMs?: number): Promise<CapabilityDescriptor>;
  markConfigurationNeeded(sessionId: string, reason?: string): PluginHostSession;
  stop(sessionId: string): PluginHostSession;
  reload(sessionId: string, options?: PluginStartOptions): Promise<PluginHostSession>;
}
declare class FileSystemLoader {
  /**
   * Filesystem-backed plugin module loader.
   *
   * Responsibilities:
   * - Resolve runtime-specific entrypoints from `ManifestV1`.
   * - Import plugin modules from local disk.
   * - Normalize module exports into either:
   *   - lazy plugin definition (`definePlugin(...)`) via `loadLazyPluginFor`, or
   *   - executable plugin hooks (`Plugin`) via `loadPluginFor`.
   */
  constructor();
  /**
   * Resolve a manifest entrypoint for the requested runtime.
   *
   * Resolution order:
   * 1) `entrypoints.<runtime>`
   * 2) `entrypoints.default`
   * 3) `entrypoints.electron` (legacy fallback for current local plugin manifests)
   *
   * Throws an actionable error when no entrypoint can be selected.
   */
  resolveEntrypointFor(manifest: ManifestV1, options?: PluginLoadOptions): string;
  /**
   * Load a lazy plugin definition (`definePlugin(...)`) without executing setup.
   *
   * Use this when host logic wants to inspect plugin metadata/setup contract first
   * and control when `setup()` is called.
   */
  loadLazyPluginFor(manifest: ManifestV1, options?: PluginLoadOptions): Promise<{
    name: string;
    version: string;
    setup: () => Promise<Plugin> | Plugin;
  }>;
  /**
   * Load and normalize a plugin entrypoint into executable `Plugin` hooks.
   *
   * Accepts:
   * - a direct `Plugin` export
   * - a default `Plugin` export
   * - `definePlugin(...)` (calls `setup()` and returns the resulting `Plugin`)
   */
  loadPluginFor(manifest: ManifestV1, options?: PluginLoadOptions): Promise<Plugin>;
}
//#endregion
export { PluginTransport as _, ModuleConfigEnvelope$1 as a, PluginHost as c, PluginIdentity$1 as d, PluginLoadOptions as f, manifestV1Schema as g, PluginStartOptions as h, ModuleCompatibilityResult as i, PluginHostOptions as l, PluginSessionPhase as m, ManifestV1 as n, ModuleIdentity$1 as o, PluginRuntime as p, ModuleCompatibilityRequest as r, ModulePhase$1 as s, FileSystemLoader as t, PluginHostSession as u };