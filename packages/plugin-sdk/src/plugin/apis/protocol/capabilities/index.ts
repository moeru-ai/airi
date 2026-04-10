import { defineInvokeEventa } from '@moeru/eventa'

export interface CapabilityDescriptor {
  key: string
  state: 'announced' | 'ready' | 'degraded' | 'withdrawn'
  metadata?: Record<string, unknown>
  updatedAt: number
}

export const protocolCapabilityWaitEventName = 'proj-airi:plugin-sdk:apis:protocol:capabilities:wait'
export const protocolCapabilityWait = defineInvokeEventa<CapabilityDescriptor, { key: string, timeoutMs?: number }>(
  protocolCapabilityWaitEventName,
)

export const protocolCapabilitySnapshotEventName = 'proj-airi:plugin-sdk:apis:protocol:capabilities:snapshot'
export const protocolCapabilitySnapshot = defineInvokeEventa<CapabilityDescriptor[]>(
  protocolCapabilitySnapshotEventName,
)
