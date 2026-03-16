import { defineEventa } from "@moeru/eventa";

//#region src/types/events.ts
let MessageHeartbeatKind = /* @__PURE__ */ function(MessageHeartbeatKind) {
	MessageHeartbeatKind["Ping"] = "ping";
	MessageHeartbeatKind["Pong"] = "pong";
	return MessageHeartbeatKind;
}({});
let MessageHeartbeat = /* @__PURE__ */ function(MessageHeartbeat) {
	MessageHeartbeat["Ping"] = "🩵";
	MessageHeartbeat["Pong"] = "💛";
	return MessageHeartbeat;
}({});
let WebSocketEventSource = /* @__PURE__ */ function(WebSocketEventSource) {
	WebSocketEventSource["Server"] = "proj-airi:server-runtime";
	WebSocketEventSource["StageWeb"] = "proj-airi:stage-web";
	WebSocketEventSource["StageTamagotchi"] = "proj-airi:stage-tamagotchi";
	return WebSocketEventSource;
}({});
let ContextUpdateStrategy = /* @__PURE__ */ function(ContextUpdateStrategy) {
	ContextUpdateStrategy["ReplaceSelf"] = "replace-self";
	ContextUpdateStrategy["AppendSelf"] = "append-self";
	return ContextUpdateStrategy;
}({});
const moduleAuthenticate = defineEventa("module:authenticate");
const moduleAuthenticated = defineEventa("module:authenticated");
const moduleCompatibilityRequest = defineEventa("module:compatibility:request");
const moduleCompatibilityResult = defineEventa("module:compatibility:result");
const registryModulesSync = defineEventa("registry:modules:sync");
const registryModulesHealthUnhealthy = defineEventa("registry:modules:health:unhealthy");
const registryModulesHealthHealthy = defineEventa("registry:modules:health:healthy");
const error = defineEventa("error");
const moduleAnnounce = defineEventa("module:announce");
const moduleAnnounced = defineEventa("module:announced");
const moduleDeAnnounced = defineEventa("module:de-announced");
const modulePrepared = defineEventa("module:prepared");
const moduleConfigurationNeeded = defineEventa("module:configuration:needed");
const moduleStatus = defineEventa("module:status");
const moduleConfigurationValidateRequest = defineEventa("module:configuration:validate:request");
const moduleConfigurationValidateResponse = defineEventa("module:configuration:validate:response");
const moduleConfigurationValidateStatus = defineEventa("module:configuration:validate:status");
const moduleConfigurationPlanRequest = defineEventa("module:configuration:plan:request");
const moduleConfigurationPlanResponse = defineEventa("module:configuration:plan:response");
const moduleConfigurationPlanStatus = defineEventa("module:configuration:plan:status");
const moduleConfigurationCommit = defineEventa("module:configuration:commit");
const moduleConfigurationCommitStatus = defineEventa("module:configuration:commit:status");
const moduleConfigurationConfigured = defineEventa("module:configuration:configured");
const moduleContributeCapabilityOffer = defineEventa("module:contribute:capability:offer");
const moduleContributeCapabilityConfigurationNeeded = defineEventa("module:contribute:capability:configuration:needed");
const moduleContributeCapabilityConfigurationValidateRequest = defineEventa("module:contribute:capability:configuration:validate:request");
const moduleContributeCapabilityConfigurationValidateResponse = defineEventa("module:contribute:capability:configuration:validate:response");
const moduleContributeCapabilityConfigurationValidateStatus = defineEventa("module:contribute:capability:configuration:validate:status");
const moduleContributeCapabilityConfigurationPlanRequest = defineEventa("module:contribute:capability:configuration:plan:request");
const moduleContributeCapabilityConfigurationPlanResponse = defineEventa("module:contribute:capability:configuration:plan:response");
const moduleContributeCapabilityConfigurationPlanStatus = defineEventa("module:contribute:capability:configuration:plan:status");
const moduleContributeCapabilityConfigurationCommit = defineEventa("module:contribute:capability:configuration:commit");
const moduleContributeCapabilityConfigurationCommitStatus = defineEventa("module:contribute:capability:configuration:commit:status");
const moduleContributeCapabilityConfigurationConfigured = defineEventa("module:contribute:capability:configuration:configured");
const moduleContributeCapabilityActivated = defineEventa("module:contribute:capability:activated");
const moduleStatusChange = defineEventa("module:status:change");
const moduleConfigure = defineEventa("module:configure");
const uiConfigure = defineEventa("ui:configure");
const inputText = defineEventa("input:text");
const inputTextVoice = defineEventa("input:text:voice");
const inputVoice = defineEventa("input:voice");
const outputGenAiChatToolCall = defineEventa("output:gen-ai:chat:tool-call");
const outputGenAiChatMessage = defineEventa("output:gen-ai:chat:message");
const outputGenAiChatComplete = defineEventa("output:gen-ai:chat:complete");
const sparkNotify = defineEventa("spark:notify");
const sparkEmit = defineEventa("spark:emit");
const sparkCommand = defineEventa("spark:command");
const transportConnectionHeartbeat = defineEventa("transport:connection:heartbeat");
const contextUpdate = defineEventa("context:update");

//#endregion
export { ContextUpdateStrategy, MessageHeartbeat, MessageHeartbeatKind, WebSocketEventSource, contextUpdate, error, inputText, inputTextVoice, inputVoice, moduleAnnounce, moduleAnnounced, moduleAuthenticate, moduleAuthenticated, moduleCompatibilityRequest, moduleCompatibilityResult, moduleConfigurationCommit, moduleConfigurationCommitStatus, moduleConfigurationConfigured, moduleConfigurationNeeded, moduleConfigurationPlanRequest, moduleConfigurationPlanResponse, moduleConfigurationPlanStatus, moduleConfigurationValidateRequest, moduleConfigurationValidateResponse, moduleConfigurationValidateStatus, moduleConfigure, moduleContributeCapabilityActivated, moduleContributeCapabilityConfigurationCommit, moduleContributeCapabilityConfigurationCommitStatus, moduleContributeCapabilityConfigurationConfigured, moduleContributeCapabilityConfigurationNeeded, moduleContributeCapabilityConfigurationPlanRequest, moduleContributeCapabilityConfigurationPlanResponse, moduleContributeCapabilityConfigurationPlanStatus, moduleContributeCapabilityConfigurationValidateRequest, moduleContributeCapabilityConfigurationValidateResponse, moduleContributeCapabilityConfigurationValidateStatus, moduleContributeCapabilityOffer, moduleDeAnnounced, modulePrepared, moduleStatus, moduleStatusChange, outputGenAiChatComplete, outputGenAiChatMessage, outputGenAiChatToolCall, registryModulesHealthHealthy, registryModulesHealthUnhealthy, registryModulesSync, sparkCommand, sparkEmit, sparkNotify, transportConnectionHeartbeat, uiConfigure };
//# sourceMappingURL=index.mjs.map