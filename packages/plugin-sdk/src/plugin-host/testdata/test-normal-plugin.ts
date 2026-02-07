import type { ContextInit } from '../../plugin/shared'

import { defineEventa } from '@moeru/eventa'

import { channels, providers } from '../../plugin'

export async function init(initContext: ContextInit): Promise<void | false> {
  initContext.host.emit(defineEventa('vitest-call:init'), undefined)
}

export async function configure(): Promise<void> {

}

export async function setupModules(): Promise<void> {
  channels.host.emit(defineEventa('vitest-call:setup-modules'), await providers.listProviders())
}
