import type { EventContext } from '@moeru/eventa'

import type {
  ResourceBindingListFilter,
  ResourceClaimCreateInput,
  ResourceClaimListFilter,
  ResourceClaimReleaseInput,
  ResourceInstance,
  ResourceListFilter,
  ResourceRegistrationInput,
  ResourceSnapshot,
} from '../../protocol/resources'

import { defineInvoke } from '@moeru/eventa'

import { protocolCapabilityWait } from '../../protocol/capabilities'
import {
  protocolResourceBindingsList,
  protocolResourceBindingsListEventName,
  protocolResourceClaimCreate,
  protocolResourceClaimCreateEventName,
  protocolResourceClaimRelease,
  protocolResourceClaimReleaseEventName,
  protocolResourceClaimsList,
  protocolResourceClaimsListEventName,
  protocolResourceList,
  protocolResourceListEventName,
  protocolResourceRegister,
  protocolResourceRegisterEventName,
  protocolResourceSnapshot,
  protocolResourceSnapshotEventName,
} from '../../protocol/resources'

async function waitCapability(ctx: EventContext<any, any>, key: string) {
  const waitForCapability = defineInvoke(ctx, protocolCapabilityWait)
  await waitForCapability({ key })
}

export function createResources(ctx: EventContext<any, any>) {
  return {
    async register(input: ResourceRegistrationInput) {
      await waitCapability(ctx, protocolResourceRegisterEventName)
      const invoke = defineInvoke(ctx, protocolResourceRegister)
      return await invoke(input)
    },
    async list(filter?: ResourceListFilter): Promise<ResourceInstance[]> {
      await waitCapability(ctx, protocolResourceListEventName)
      const invoke = defineInvoke(ctx, protocolResourceList)
      return await invoke(filter)
    },
    async createClaim(input: ResourceClaimCreateInput) {
      await waitCapability(ctx, protocolResourceClaimCreateEventName)
      const invoke = defineInvoke(ctx, protocolResourceClaimCreate)
      return await invoke(input)
    },
    async releaseClaim(input: ResourceClaimReleaseInput) {
      await waitCapability(ctx, protocolResourceClaimReleaseEventName)
      const invoke = defineInvoke(ctx, protocolResourceClaimRelease)
      return await invoke(input)
    },
    async listClaims(filter?: ResourceClaimListFilter) {
      await waitCapability(ctx, protocolResourceClaimsListEventName)
      const invoke = defineInvoke(ctx, protocolResourceClaimsList)
      return await invoke(filter)
    },
    async listBindings(filter?: ResourceBindingListFilter) {
      await waitCapability(ctx, protocolResourceBindingsListEventName)
      const invoke = defineInvoke(ctx, protocolResourceBindingsList)
      return await invoke(filter)
    },
    async snapshot(): Promise<ResourceSnapshot> {
      await waitCapability(ctx, protocolResourceSnapshotEventName)
      const invoke = defineInvoke(ctx, protocolResourceSnapshot)
      return await invoke()
    },
  }
}
