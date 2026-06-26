import type { ContextInit } from '../../plugin/shared'

import { defineEventa } from '@moeru/eventa'

export function init({ channels }: ContextInit): Promise<void | false> {
  channels.host.emit(defineEventa('vitest-call:init'), undefined)
  return Promise.resolve()
}

export function configure(): void {
  // noop
}

export async function setupModules({ apis, channels }: ContextInit): Promise<void> {
  const providerList = await apis.providers.listProviders()
  channels.host.emit(defineEventa('vitest-call:setup-modules'), providerList)
}
