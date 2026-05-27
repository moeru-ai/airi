import * as _$valibot from "valibot";
import { InferOutput } from "valibot";
import { EventContext } from "@moeru/eventa";
//#region ../../node_modules/.pnpm/xstate@5.30.0/node_modules/xstate/dist/declarations/src/index.d.ts
declare global {
  interface SymbolConstructor {
    readonly observable: symbol;
  }
}
//#endregion
//#region ../../packages/plugin-sdk/dist/index-CimmAJR1.d.mts
//#endregion
//#region src/plugin-host/shared/kits.d.ts
/**
 * Validates one declared capability inside a kit descriptor.
 *
 * Use when:
 * - Parsing or validating host-owned kit descriptors
 *
 * Expects:
 * - `key` is stable and `actions` lists the allowed capability actions
 *
 * Returns:
 * - A Valibot schema for one kit capability descriptor
 */
declare const kitCapabilitySchema: _$valibot.ObjectSchema<{
  readonly key: _$valibot.SchemaWithPipe<readonly [_$valibot.StringSchema<undefined>, _$valibot.DescriptionAction<string, "Stable capability key exposed by this kit.">]>;
  readonly actions: _$valibot.SchemaWithPipe<readonly [_$valibot.ArraySchema<_$valibot.SchemaWithPipe<readonly [_$valibot.StringSchema<undefined>, _$valibot.DescriptionAction<string, "Capability action supported by this kit capability entry.">]>, undefined>, _$valibot.DescriptionAction<string[], "Allowed actions for this capability key.">]>;
}, undefined>;
/**
 * Validates one host-owned kit descriptor.
 *
 * Use when:
 * - Parsing or validating kit registry snapshots
 *
 * Expects:
 * - `capabilities` and `runtimes` describe where and how the kit can be used
 *
 * Returns:
 * - A Valibot schema for one kit descriptor
 */
declare const kitDescriptorSchema: _$valibot.ObjectSchema<{
  readonly kitId: _$valibot.SchemaWithPipe<readonly [_$valibot.StringSchema<undefined>, _$valibot.DescriptionAction<string, "Stable identifier for the host-registered kit.">]>;
  readonly version: _$valibot.SchemaWithPipe<readonly [_$valibot.StringSchema<undefined>, _$valibot.DescriptionAction<string, "Semantic version of the kit contract.">]>;
  readonly capabilities: _$valibot.SchemaWithPipe<readonly [_$valibot.ArraySchema<_$valibot.ObjectSchema<{
    readonly key: _$valibot.SchemaWithPipe<readonly [_$valibot.StringSchema<undefined>, _$valibot.DescriptionAction<string, "Stable capability key exposed by this kit.">]>;
    readonly actions: _$valibot.SchemaWithPipe<readonly [_$valibot.ArraySchema<_$valibot.SchemaWithPipe<readonly [_$valibot.StringSchema<undefined>, _$valibot.DescriptionAction<string, "Capability action supported by this kit capability entry.">]>, undefined>, _$valibot.DescriptionAction<string[], "Allowed actions for this capability key.">]>;
  }, undefined>, undefined>, _$valibot.DescriptionAction<{
    key: string;
    actions: string[];
  }[], "Capabilities exposed by this kit descriptor.">]>;
  readonly runtimes: _$valibot.SchemaWithPipe<readonly [_$valibot.ArraySchema<_$valibot.SchemaWithPipe<readonly [_$valibot.PicklistSchema<readonly ["electron", "node", "web"], undefined>, _$valibot.DescriptionAction<"electron" | "node" | "web", "Runtime supported by this kit descriptor.">]>, undefined>, _$valibot.DescriptionAction<("electron" | "node" | "web")[], "Runtimes where this kit can be used.">]>;
}, undefined>;
/**
 * Describes one capability declared by a host kit.
 *
 * Use when:
 * - Reading kit metadata from the registry or plugin APIs
 *
 * Expects:
 * - Values have already been validated by {@link kitCapabilitySchema}
 *
 * Returns:
 * - The inferred kit capability descriptor type
 */
type KitCapabilityDescriptor = InferOutput<typeof kitCapabilitySchema>;
/**
 * Describes one host-registered kit contract.
 *
 * Use when:
 * - Reading kit metadata from the registry or plugin APIs
 *
 * Expects:
 * - Values have already been validated by {@link kitDescriptorSchema}
 *
 * Returns:
 * - The inferred kit descriptor type
 */
type KitDescriptor = InferOutput<typeof kitDescriptorSchema>; //#endregion
//#region src/plugin-host/shared/types.d.ts
/**
 * Lists the supported plugin runtimes recognized by the host.
 *
 * Use when:
 * - Validating manifest entrypoints or host runtime configuration
 * - Narrowing `PluginRuntime` to the canonical literals
 *
 * Expects:
 * - Runtime-specific code branches use one of these exact values
 *
 * Returns:
 * - The canonical runtime literals used throughout plugin-sdk
 */
declare const pluginRuntimeValues: readonly ["electron", "node", "web"];
/**
 * Describes one supported plugin runtime.
 *
 * Use when:
 * - Typing host runtime configuration and manifest runtime selection
 *
 * Expects:
 * - Values come from {@link pluginRuntimeValues}
 *
 * Returns:
 * - The union of valid runtime literals
 */
/**
 * Describes a JSON-like array accepted by plugin-host shared data schemas.
 *
 * Use when:
 * - Typing serializable arrays inside binding config, resource payloads, or tool schemas
 *
 * Expects:
 * - Every element is a {@link HostDataValue}
 *
 * Returns:
 * - A recursive array interface for host-safe data
 */
interface HostDataArray extends Array<HostDataValue> {}
/**
 * Describes a JSON-like object accepted by plugin-host shared data schemas.
 *
 * Use when:
 * - Typing serializable records inside binding config, resource payloads, or tool schemas
 *
 * Expects:
 * - Every property value is a {@link HostDataValue}
 *
 * Returns:
 * - A recursive record interface for host-safe data
 */
interface HostDataRecord {
  [key: string]: HostDataValue;
}
/**
 * Describes the recursive JSON-like value model accepted by the host.
 *
 * Use when:
 * - Typing payloads that must stay serializable across plugin boundaries
 *
 * Expects:
 * - Values are limited to primitives, arrays, or plain-object records
 *
 * Returns:
 * - The recursive union used across shared host data structures
 */
type HostDataValue = null | string | number | boolean | HostDataArray | HostDataRecord;
/**
 * Creates the recursive Valibot schema used for one {@link HostDataValue}.
 *
 * Use when:
 * - You need a fresh recursive schema instance for nested host data validation
 *
 * Expects:
 * - Values are plain JSON-like data and not class instances
 *
 * Returns:
 * - A Valibot schema covering the full `HostDataValue` recursion
 */
//#endregion
//#region src/plugin-host/shared/bindings.d.ts
/**
 * Lists the valid lifecycle states for one host-managed binding record.
 *
 * Use when:
 * - Validating binding state values
 * - Narrowing `BindingState` to the canonical lifecycle literals
 *
 * Expects:
 * - State transitions follow the host binding lifecycle rules
 *
 * Returns:
 * - The canonical ordered list of binding lifecycle values
 */
declare const bindingStateValues: readonly ["announced", "active", "degraded", "withdrawn"];
/**
 * Validates the serializable shape of one binding record.
 *
 * Use when:
 * - Parsing or validating host-owned binding registry snapshots
 *
 * Expects:
 * - `config` is JSON-like host data and timestamps are non-negative integers
 *
 * Returns:
 * - A Valibot schema for one binding record
 */
/**
 * Describes one valid binding lifecycle state.
 *
 * Use when:
 * - Typing host-owned binding records
 *
 * Expects:
 * - Values come from {@link bindingStateValues}
 *
 * Returns:
 * - The union of valid binding state literals
 */
type BindingState = typeof bindingStateValues[number];
/**
 * Describes one host-managed binding record.
 *
 * Use when:
 * - Reading binding registry state from the host
 * - Returning binding snapshots through plugin APIs
 *
 * Expects:
 * - `moduleId` is unique within the registry
 * - `kitId` and `kitModuleType` identify the higher-level contract being bound
 *
 * Returns:
 * - A serializable binding snapshot including lifecycle metadata and config
 */
interface BindingRecord<C extends HostDataRecord = HostDataRecord> {
  moduleId: string;
  ownerSessionId: string;
  ownerPluginId: string;
  kitId: string;
  kitModuleType: string;
  state: BindingState;
  runtime: (typeof pluginRuntimeValues)[number];
  revision: number;
  updatedAt: number;
  config: C;
}
/**
 * Describes the validated output shape of {@link bindingRecordSchema}.
 *
 * Use when:
 * - You need the exact schema-derived output type instead of the generic interface
 *
 * Expects:
 * - Values have already passed through {@link bindingRecordSchema}
 *
 * Returns:
 * - The inferred Valibot output type for one binding record
 */
/**
 * Captures the single source-of-truth definition submitted by a plugin.
 *
 * Use when:
 * - Registering tools from plugin runtimes into the host
 *
 * Expects:
 * - `parameters` already contains a serialized input schema
 *
 * Returns:
 * - A host-owned record that can be derived into UI metadata and xsai schemas
 */
interface PluginToolDefinitionRecord {
  id: string;
  title: string;
  description: string;
  activation: {
    keywords: string[];
    patterns: string[];
  };
  parameters: HostDataRecord;
} //#endregion
//#region src/plugin-host/runtimes/shared/services/bindings.d.ts
/**
 * Declares the host-owned data needed to create one binding record.
 *
 * Use when:
 * - A plugin session contributes a concrete runtime instance through a kit
 * - Higher-level kit helpers need to persist their low-level binding into the host registry
 *
 * Expects:
 * - `moduleId` is stable within the owning plugin session
 * - `kitId` points at a host-registered kit that defines the binding family
 * - `kitModuleType` is a kit-defined subtype key, not a host-wide enum
 * - `config` is transport-safe and already normalized by the caller
 *
 * Returns:
 * - A serializable payload that {@link BindingsRegistryService.bind} stores as canonical binding state
 */
/**
 * Describes an incremental change to a binding record.
 *
 * Use when:
 * - A kit-specific API needs to change binding lifecycle state
 * - A plugin updates binding configuration after initial registration
 *
 * Expects:
 * - `state` follows the host lifecycle rules for the current record
 * - `config` only contains fields that should be shallow-merged into the current config
 *
 * Returns:
 * - A partial mutation applied by {@link BindingsRegistryService.update} or {@link BindingsRegistryService.transition}
 */
interface BindingUpdatePatch<C extends HostDataRecord = HostDataRecord> {
  state?: BindingState;
  config?: Partial<C>;
}
/**
 * Identifies the plugin session that owns a binding record.
 *
 * Use when:
 * - Enforcing that only the original plugin session mutates or removes a binding
 * - Comparing current callers against stored binding ownership
 *
 * Expects:
 * - `ownerSessionId` is the ephemeral runtime session id
 * - `ownerPluginId` is the stable plugin identity across sessions
 *
 * Returns:
 * - A compact identity tuple used in collision and ownership checks
 */
/**
 * Describes the payload required to declare a new binding instance.
 *
 * Use when:
 * - Calling `apis.bindings.announce(...)`
 *
 * Expects:
 * - `moduleId` is unique within the host registry
 * - `kitId` and `kitModuleType` identify the higher-level kit contract being bound
 *
 * Returns:
 * - A serializable binding declaration payload
 */
interface AnnounceBindingInput<C extends HostDataRecord = HostDataRecord> {
  moduleId: string;
  kitId: string;
  kitModuleType: string;
  config: C;
}
/**
 * Identifies which binding should transition to the active state.
 *
 * Use when:
 * - Calling `apis.bindings.activate(...)`
 *
 * Expects:
 * - `moduleId` points at an existing host-managed binding
 *
 * Returns:
 * - A minimal activation request payload
 */
interface ActivateBindingInput {
  moduleId: string;
}
/**
 * Describes a partial update to one binding record.
 *
 * Use when:
 * - Calling `apis.bindings.update(...)`
 *
 * Expects:
 * - `moduleId` identifies the existing binding being changed
 * - Any provided patch fields are valid for the target binding
 *
 * Returns:
 * - A serializable binding update payload
 */
interface UpdateBindingInput<C extends HostDataRecord = HostDataRecord> extends BindingUpdatePatch<C> {
  moduleId: string;
}
/**
 * Identifies which binding should transition to the withdrawn state.
 *
 * Use when:
 * - Calling `apis.bindings.withdraw(...)`
 *
 * Expects:
 * - `moduleId` points at an existing host-managed binding
 *
 * Returns:
 * - A minimal withdrawal request payload
 */
interface WithdrawBindingInput {
  moduleId: string;
}
/**
 * Defines the host-side callbacks needed by the low-level bindings client.
 *
 * Use when:
 * - Wiring `session.apis.bindings` to host-owned registry logic
 *
 * Expects:
 * - Each callback returns the cloned binding record state observed by plugin code
 *
 * Returns:
 * - The callback contract consumed by {@link createBindings}
 */
interface BindingClientBindings<C extends HostDataRecord = HostDataRecord> {
  list: () => Promise<BindingRecord<C>[]> | BindingRecord<C>[];
  announce: (input: AnnounceBindingInput<C>) => Promise<BindingRecord<C>> | BindingRecord<C>;
  activate: (input: ActivateBindingInput) => Promise<BindingRecord<C>> | BindingRecord<C>;
  update: (input: UpdateBindingInput<C>) => Promise<BindingRecord<C>> | BindingRecord<C>;
  withdraw: (input: WithdrawBindingInput) => Promise<BindingRecord<C>> | BindingRecord<C>;
}
/**
 * Creates the low-level bindings client exposed on `session.apis`.
 *
 * Use when:
 * - Building the plugin SDK API object for a specific session
 *
 * Expects:
 * - `bindings` comes from a host that manages binding records
 *
 * Returns:
 * - A minimal `bindings.*` client that forwards to the bound host callbacks
 */
/**
 * Carries a low-level plugin tool registration request into the host.
 *
 * Use when:
 * - A plugin has already normalized its tool metadata and JSON Schema
 *
 * Expects:
 * - `tool` is serializable and validated by the caller
 * - `execute` accepts JSON-compatible input from the host
 *
 * Returns:
 * - A registration payload consumed by the bound host implementation
 */
interface RegisterToolInput {
  tool: PluginToolDefinitionRecord;
  availability?: () => Promise<boolean> | boolean;
  execute: (input: unknown) => Promise<unknown> | unknown;
}
/**
 * Defines the host-side callbacks needed by the low-level plugin tool client.
 *
 * Use when:
 * - Wiring plugin session APIs to host-owned registries
 *
 * Expects:
 * - `register` stores or forwards the tool definition in the host
 *
 * Returns:
 * - The bound client methods used by {@link createTools}
 */
interface ToolClientBindings {
  register: (input: RegisterToolInput) => Promise<void> | void;
}
/**
 * Creates the low-level plugin tool client surface exposed on `session.apis`.
 *
 * Use when:
 * - Building the plugin SDK API object for a specific session
 *
 * Expects:
 * - `bindings` comes from a host that knows how to store tool registrations
 *
 * Returns:
 * - A minimal `tools.register(...)` client
 */
//#endregion
//#region src/channels/shared.d.ts
/**
 * Describes the control-plane Eventa context used between a plugin and its host.
 *
 * Use when:
 * - Typing `ContextInit.channels.host`
 * - Passing a host-backed Eventa context through plugin bootstrap code
 *
 * Expects:
 * - The context transports plugin-host lifecycle and RPC traffic
 *
 * Returns:
 * - An Eventa context whose raw transport payload may be exposed through `raw`
 */
type ChannelHost = EventContext<unknown, {
  raw?: any;
}>; //#endregion
//#region src/plugin/shared.d.ts
/**
 * Describes the host-provided context injected into plugin hooks.
 *
 * Use when:
 * - Implementing `Plugin.init`
 * - Implementing `Plugin.setupModules`
 *
 * Expects:
 * - `channels.host` is the control-plane Eventa context for the session
 * - `apis` contains the host-bound plugin API surface for that session
 *
 * Returns:
 * - A stable bootstrap object shared across plugin lifecycle hooks
 */
interface ContextInit {
  channels: {
    host: ChannelHost;
  };
  apis: PluginApis;
}
/**
 * Defines the hook surface implemented by a plugin module.
 *
 * Use when:
 * - Exporting plugin behavior from a runtime entrypoint
 *
 * Expects:
 * - Hooks are optional, but at least one meaningful hook should be provided by a real plugin
 *
 * Returns:
 * - A plugin lifecycle object consumed by the plugin host loader
 */
/**
 * Defines the host-side callbacks needed by the low-level kit client.
 *
 * Use when:
 * - Wiring `session.apis.kits` to host-owned kit registry logic
 *
 * Expects:
 * - `list` returns runtime-filtered kit descriptors
 * - `getCapabilities` returns only the capabilities for the requested kit
 *
 * Returns:
 * - The callback contract consumed by {@link createKits}
 */
interface KitClientBindings<TKit extends KitDescriptor = KitDescriptor> {
  list: () => Promise<TKit[]> | TKit[];
  getCapabilities: (kitId: string) => Promise<KitCapabilityDescriptor[]> | KitCapabilityDescriptor[];
}
/**
 * Creates the low-level kit client exposed on `session.apis`.
 *
 * Use when:
 * - Building the plugin SDK API object for a specific session
 *
 * Expects:
 * - `bindings` comes from a host that manages kit descriptors
 *
 * Returns:
 * - A minimal `kits.*` client that forwards to the bound host callbacks
 */
//#endregion
//#region src/plugin/apis/client/index.d.ts
/**
 * Collects the host-provided callbacks that back the plugin client API surface.
 *
 * Use when:
 * - Binding `session.apis` to host-owned implementations
 *
 * Expects:
 * - Each optional binding group is supplied when that API family should be available
 *
 * Returns:
 * - A map of callback groups consumed by {@link createApis}
 */
interface PluginApiBindings {
  kits?: KitClientBindings;
  bindings?: BindingClientBindings;
  tools?: ToolClientBindings;
}
/**
 * Creates the low-level plugin API surface exposed to plugin code.
 *
 * Use when:
 * - Building `ContextInit.apis` for a plugin session
 *
 * Expects:
 * - `ctx` is the Eventa context for the current plugin session
 * - `bindings` contains the host-backed callbacks for each enabled API group
 *
 * Returns:
 * - The composed built-in plugin client APIs for resources, kits, bindings, and tools
 */
declare function createApis(ctx: EventContext<any, any>, bindings?: PluginApiBindings): {
  kits: {
    list(): Promise<{
      kitId: string;
      version: string;
      capabilities: {
        key: string;
        actions: string[];
      }[];
      runtimes: ("electron" | "node" | "web")[];
    }[]>;
    getCapabilities(kitId: string): Promise<{
      key: string;
      actions: string[];
    }[]>;
  };
  bindings: {
    list(): Promise<BindingRecord<HostDataRecord>[]>;
    announce(input: AnnounceBindingInput<HostDataRecord>): Promise<BindingRecord<HostDataRecord>>;
    activate(input: ActivateBindingInput): Promise<BindingRecord<HostDataRecord>>;
    update(input: UpdateBindingInput<HostDataRecord>): Promise<BindingRecord<HostDataRecord>>;
    withdraw(input: WithdrawBindingInput): Promise<BindingRecord<HostDataRecord>>;
  };
  tools: {
    register(input: RegisterToolInput): Promise<void>;
  };
  providers: {
    listProviders(): Promise<{
      name: string;
    }[]>;
  };
};
/**
 * Describes the concrete API object returned by {@link createApis}.
 *
 * Use when:
 * - Typing `ContextInit.apis`
 *
 * Expects:
 * - The caller uses the same shape as the runtime-created API object
 *
 * Returns:
 * - The inferred plugin API client surface
 */
type PluginApis = ReturnType<typeof createApis>; //#endregion
//#region src/plugin/define.d.ts
/**
 * Declares a lazily constructed plugin definition with stable metadata.
 *
 * Use when:
 * - A plugin entrypoint wants to expose metadata and deferred setup together
 *
 * Expects:
 * - `setup` returns a {@link Plugin} object when the host loads the entrypoint
 *
 * Returns:
 * - A serializable plugin definition that loaders can recognize and execute
 */
//#endregion
//#region src/index.d.ts
/** Plugin lifecycle hook — no eager work is needed before the host APIs exist. */
declare function init(): Promise<void>;
/** Plugin lifecycle hook — the chess plugin has no host-configurable settings yet. */
declare function configure(): Promise<void>;
/**
 * Registers the chess gamelet UI and the coach's analysis tools, then opens the
 * board.
 *
 * Use when:
 * - The plugin host reaches the module-setup lifecycle phase
 *
 * Expects:
 * - `apis` exposes the stage-tamagotchi gamelet kit and the tool registry
 */
declare function setupModules({
  apis
}: ContextInit): Promise<void>;
//#endregion
export { configure, init, setupModules };