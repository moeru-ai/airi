/**
 * AIRI Core — Capability Runtime
 *
 * Barrel export for the capability + tool runtime layer.
 *
 * @example
 * ```ts
 * import {
 *   CapabilityRegistry,
 *   createCapabilityId,
 *   createToolId,
 * } from '../core/capabilities/index.js'
 * ```
 */

// ── Types
export type {
	CapabilityId,
	ToolId,
	CapabilityDescriptor,
	ToolDescriptor,
	ToolExecutionContext,
	ToolExecutionResult,
	CapabilityStatus,
	CapabilityInfo,
} from "./types.js"
export { createCapabilityId, createToolId } from "./types.js"

// ── Registry
export { CapabilityRegistry } from "./registry.js"
