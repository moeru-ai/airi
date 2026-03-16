import { _ as PluginTransport, a as ModuleConfigEnvelope, c as PluginHost, d as PluginIdentity, f as PluginLoadOptions, g as manifestV1Schema, h as PluginStartOptions, i as ModuleCompatibilityResult, l as PluginHostOptions, m as PluginSessionPhase, n as ManifestV1, o as ModuleIdentity, p as PluginRuntime, r as ModuleCompatibilityRequest, s as ModulePhase, t as FileSystemLoader, u as PluginHostSession } from "../../../core-CnRybgbo.mjs";
import { EventContext } from "@moeru/eventa";

//#region src/plugin-host/runtimes/web/index.d.ts
declare function createPluginContext(transport: PluginTransport): EventContext<any, any>;
//#endregion
export { FileSystemLoader, ManifestV1, ModuleCompatibilityRequest, ModuleCompatibilityResult, ModuleConfigEnvelope, ModuleIdentity, ModulePhase, PluginHost, PluginHostOptions, PluginHostSession, PluginIdentity, PluginLoadOptions, PluginRuntime, PluginSessionPhase, PluginStartOptions, PluginTransport, createPluginContext, manifestV1Schema };