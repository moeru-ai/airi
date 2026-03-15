import { defineInvokeEventa } from '@moeru/eventa'

export interface CapabilityDescriptor {
  key: string
  state: 'announced' | 'ready' | 'degraded' | 'withdrawn'
  metadata?: Record<string, unknown>
  updatedAt: number
}

export const protocolCapabilityWait = defineInvokeEventa<CapabilityDescriptor, { key: string, timeoutMs?: number }>(
  'proj-airi:plugin-sdk:apis:protocol:capabilities:wait',
)

export const protocolCapabilitySnapshot = defineInvokeEventa<CapabilityDescriptor[]>(
  'proj-airi:plugin-sdk:apis:protocol:capabilities:snapshot',
)
