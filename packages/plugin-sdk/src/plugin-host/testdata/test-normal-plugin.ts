import type { ContextInit } from '../../plugin/shared'

import { defineEventa } from '@moeru/eventa'

export async function init({ channels }: ContextInit): Promise<void | false> {
  channels.host.emit(defineEventa('vitest-call:init'), undefined)
}

export async function configure(): Promise<void> {

}

export async function setupModules({ apis, channels }: ContextInit): Promise<void> {
  const providerList = await apis.providers.listProviders()
  channels.host.emit(defineEventa('vitest-call:setup-modules'), providerList)
}
