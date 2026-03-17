import { defineInvokeEventa } from '@moeru/eventa'

export type ResourcePhase = 'Ready' | 'Degraded' | 'Withdrawn'
export type ResourceClaimPhase = 'Pending' | 'Bound' | 'Degraded' | 'Released' | 'Failed'
export type ConditionStatus = 'True' | 'False' | 'Unknown'

export interface ResourceCondition {
  type: string
  status: ConditionStatus
  reason: string
  message: string
  lastTransitionTime: string
}

export interface ResourceOwnerRef {
  pluginId?: string
  moduleId?: string
  sessionId?: string
}

export interface ResourceInstance {
  id: string
  kind: string
  labels?: Record<string, string>
  metadata?: Record<string, unknown>
  phase: ResourcePhase
  owner?: ResourceOwnerRef
  updatedAt: number
}

export interface ResourceClaim {
  id: string
  kind: string
  owner?: ResourceOwnerRef
  selector?: Record<string, string>
  constraints?: Record<string, unknown>
  phase: ResourceClaimPhase
  bindingId?: string
  conditions: ResourceCondition[]
  updatedAt: number
}

export interface ResourceBinding {
  id: string
  claimId: string
  resourceId: string
  phase: ResourceClaimPhase
  conditions: ResourceCondition[]
  updatedAt: number
}

export interface ResourceListFilter {
  kind?: string
  phase?: ResourcePhase
  labels?: Record<string, string>
}

export interface ResourceClaimListFilter {
  kind?: string
  phase?: ResourceClaimPhase
  ownerPluginId?: string
}

export interface ResourceBindingListFilter {
  claimId?: string
  resourceId?: string
  phase?: ResourceClaimPhase
}

export interface ResourceRegistrationInput {
  id?: string
  kind: string
  labels?: Record<string, string>
  metadata?: Record<string, unknown>
  phase?: ResourcePhase
  owner?: ResourceOwnerRef
}

export interface ResourceClaimCreateInput {
  id?: string
  kind: string
  owner?: ResourceOwnerRef
  selector?: Record<string, string>
  constraints?: Record<string, unknown>
}

export interface ResourceClaimReleaseInput {
  id: string
  reason?: string
}

export interface ResourceSnapshot {
  resources: ResourceInstance[]
  claims: ResourceClaim[]
  bindings: ResourceBinding[]
}

export const protocolResourceRegisterEventName = 'proj-airi:plugin-sdk:apis:protocol:resources:register'
export const protocolResourceListEventName = 'proj-airi:plugin-sdk:apis:protocol:resources:list'
export const protocolResourceClaimCreateEventName = 'proj-airi:plugin-sdk:apis:protocol:resources:claim:create'
export const protocolResourceClaimReleaseEventName = 'proj-airi:plugin-sdk:apis:protocol:resources:claim:release'
export const protocolResourceClaimsListEventName = 'proj-airi:plugin-sdk:apis:protocol:resources:claims:list'
export const protocolResourceBindingsListEventName = 'proj-airi:plugin-sdk:apis:protocol:resources:bindings:list'
export const protocolResourceSnapshotEventName = 'proj-airi:plugin-sdk:apis:protocol:resources:snapshot'

export const protocolResourceRegister = defineInvokeEventa<ResourceInstance, ResourceRegistrationInput>(protocolResourceRegisterEventName)
export const protocolResourceList = defineInvokeEventa<ResourceInstance[], ResourceListFilter | undefined>(protocolResourceListEventName)
export const protocolResourceClaimCreate = defineInvokeEventa<ResourceClaim, ResourceClaimCreateInput>(protocolResourceClaimCreateEventName)
export const protocolResourceClaimRelease = defineInvokeEventa<ResourceClaim, ResourceClaimReleaseInput>(protocolResourceClaimReleaseEventName)
export const protocolResourceClaimsList = defineInvokeEventa<ResourceClaim[], ResourceClaimListFilter | undefined>(protocolResourceClaimsListEventName)
export const protocolResourceBindingsList = defineInvokeEventa<ResourceBinding[], ResourceBindingListFilter | undefined>(protocolResourceBindingsListEventName)
export const protocolResourceSnapshot = defineInvokeEventa<ResourceSnapshot>(protocolResourceSnapshotEventName)
