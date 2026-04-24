import { defineInvokeEventa } from '@moeru/eventa'

/**
 * Describes one capability snapshot exposed by the host dependency registry.
 *
 * Use when:
 * - Reading capability readiness from `protocolCapabilityWait`
 * - Inspecting the full capability snapshot from `protocolCapabilitySnapshot`
 *
 * Expects:
 * - `key` is stable across the capability lifecycle
 *
 * Returns:
 * - A serializable view of capability state and optional metadata
 */
export interface CapabilityDescriptor {
  key: string
  state: 'announced' | 'ready' | 'degraded' | 'withdrawn'
  metadata?: Record<string, unknown>
  updatedAt: number
}

/**
 * Identifies the control-plane RPC used to wait for one capability.
 *
 * Use when:
 * - Declaring permissions or invoking the wait RPC directly
 *
 * Expects:
 * - Host and plugin agree on this event name
 *
 * Returns:
 * - The permission/event key string for capability waiting
 */
export const protocolCapabilityWaitEventName = 'proj-airi:plugin-sdk:apis:protocol:capabilities:wait'
/**
 * Defines the control-plane RPC that blocks until a capability becomes ready.
 *
 * Use when:
 * - A plugin needs another host capability before continuing initialization
 *
 * Expects:
 * - The host implements the matching invoke handler
 *
 * Returns:
 * - A typed Eventa invoke descriptor for waiting on one capability
 */
export const protocolCapabilityWait = defineInvokeEventa<CapabilityDescriptor, { key: string, timeoutMs?: number }>(
  protocolCapabilityWaitEventName,
)

/**
 * Identifies the control-plane RPC used to snapshot all capabilities.
 *
 * Use when:
 * - Declaring permissions or invoking the snapshot RPC directly
 *
 * Expects:
 * - Host and plugin agree on this event name
 *
 * Returns:
 * - The permission/event key string for capability snapshots
 */
export const protocolCapabilitySnapshotEventName = 'proj-airi:plugin-sdk:apis:protocol:capabilities:snapshot'
/**
 * Defines the control-plane RPC that returns the current capability snapshot.
 *
 * Use when:
 * - A plugin or host tool wants the current state of all capabilities
 *
 * Expects:
 * - The host implements the matching invoke handler
 *
 * Returns:
 * - A typed Eventa invoke descriptor for reading all capability descriptors
 */
export const protocolCapabilitySnapshot = defineInvokeEventa<CapabilityDescriptor[]>(
  protocolCapabilitySnapshotEventName,
)
