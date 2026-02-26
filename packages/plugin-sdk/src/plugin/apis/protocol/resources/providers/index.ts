import { defineInvokeEventa } from '@moeru/eventa'

export const protocolListProvidersEventName = 'proj-airi:plugin-sdk:apis:protocol:resources:providers:list-providers'
export const protocolListProviders = defineInvokeEventa<{ name: string }[]>(protocolListProvidersEventName)

export const protocolProviders = {
  listProviders: protocolListProviders,
}
