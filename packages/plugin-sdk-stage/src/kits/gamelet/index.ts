import type { ExtensionModuleRef } from '@proj-airi/plugin-sdk'
import type { HostDataRecord } from '@proj-airi/plugin-sdk/plugin-host'

import { nanoid } from 'nanoid/non-secure'

import { gameletKit } from '../../gamelet'

const unavailableMessage = 'gameletKit requires a host gamelet orchestration runtime.'

/** Options used to mount one portable iframe gamelet. */
export interface CreateGameletOptions<TInit extends HostDataRecord = HostDataRecord> {
  id?: string
  title: string
  indexPath: string
  init?: TInit
  sandbox?: string
  devServerUrl?: string
}

/** Handle used by an extension to control one gamelet. */
export interface GameletHandle<TInit extends HostDataRecord = HostDataRecord> {
  id: string
  bindingId: string
  init?: TInit
  open: (payload?: HostDataRecord) => Promise<void>
  configure: (payload: HostDataRecord) => Promise<void>
  request: <TResponse = HostDataRecord>(payload: HostDataRecord, options?: { timeoutMs?: number }) => Promise<TResponse>
  close: () => Promise<void>
  isOpen: () => Promise<boolean>
}

/** Creates a module-scoped gamelet and returns its lifecycle handle. */
export async function createGamelet<TInit extends HostDataRecord = HostDataRecord>(
  module: ExtensionModuleRef,
  options: CreateGameletOptions<TInit>,
): Promise<GameletHandle<TInit>> {
  const id = options.id ?? nanoid()
  const bindingId = `${module.id}:${id}`
  const gamelets = await module.kits.use(gameletKit)

  await gamelets.mount({
    bindingId,
    title: options.title,
    ui: gamelets.iframe({
      assetPath: options.devServerUrl === undefined ? options.indexPath : undefined,
      src: options.devServerUrl,
      sandbox: options.sandbox,
    }),
    init: options.init,
  })

  const orchestration = requireOrchestration(gamelets)
  const handle: GameletHandle<TInit> = {
    id,
    bindingId,
    open: async payload => await orchestration.open(bindingId, payload),
    configure: async payload => await orchestration.configure(bindingId, payload),
    request: async <TResponse = HostDataRecord>(payload: HostDataRecord, requestOptions?: { timeoutMs?: number }) => {
      return await orchestration.request<TResponse>(bindingId, payload, requestOptions)
    },
    close: async () => await orchestration.close(bindingId),
    isOpen: async () => await orchestration.isOpen(bindingId),
  }

  module.subscriptions.add({
    async dispose() {
      await gamelets.orchestration?.close(bindingId)
    },
  })

  return options.init === undefined ? handle : { ...handle, init: options.init }
}

export { gameletKit }

function requireOrchestration(gamelets: Awaited<ReturnType<typeof gameletKit.createClient>>): NonNullable<typeof gamelets.orchestration> {
  if (!gamelets.orchestration) {
    throw new Error(unavailableMessage)
  }

  return gamelets.orchestration
}
