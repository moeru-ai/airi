import { defineInvokeEventa } from '@moeru/eventa'

export const protocolListProviders = defineInvokeEventa<{ name: string }[]>('proj-airi:plugin-sdk:apis:protocol:resources:providers:list-providers')

export const protocolProviders = {
  listProviders: protocolListProviders,
}
