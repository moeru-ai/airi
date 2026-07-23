import type { ExtensionModuleRef } from '@proj-airi/plugin-sdk'
import type { HostDataRecord } from '@proj-airi/plugin-sdk/plugin-host'

import { nanoid } from 'nanoid/non-secure'

import { gameletKit } from '../../gamelet'

const GAMELET_RUNTIME_UNAVAILABLE_MESSAGE = 'gameletKit requires a host gamelet orchestration runtime.'

/**
 * Options used to declare and mount one Tamagotchi gamelet UI contribution.
 *
 * @param TInit Initial host-safe configuration passed to the mounted gamelet.
 */
export interface CreateGameletOptions<TInit extends HostDataRecord = HostDataRecord> {
  /** Stable gamelet id within the extension module. Generated when omitted. */
  id?: string
  /** Human-readable title shown by the host around the gamelet surface. */
  title: string
  /** Plugin asset path for the iframe HTML entrypoint. */
  indexPath: string
  /** Initial host-safe configuration delivered to the iframe widget. */
  init?: TInit
  /** iframe sandbox policy. Defaults to the low-level gamelet kit sandbox. */
  sandbox?: string
  /** Development server URL used by hosts that can load an iframe from a live dev server. */
  devServerUrl?: string
}

/**
 * Runtime handle returned after a gamelet is mounted.
 *
 * @param TInit Initial host-safe configuration type associated with the gamelet.
 */
export interface GameletHandle<TInit extends HostDataRecord = HostDataRecord> {
  /** Stable gamelet id within the extension module. */
  id: string
  /** Fully qualified host binding id, formatted as `<moduleId>:<gameletId>`. */
  bindingId: string
  /** Initial host-safe configuration delivered to the iframe widget. */
  init?: TInit
  /** Opens the gamelet through the host orchestration runtime. */
  open: (payload?: HostDataRecord) => Promise<void>
  /** Reconfigures the gamelet through the host orchestration runtime. */
  configure: (payload: HostDataRecord) => Promise<void>
  /** Sends a request to the gamelet through the host orchestration runtime. */
  request: <TResponse = HostDataRecord>(payload: HostDataRecord, options?: { timeoutMs?: number }) => Promise<TResponse>
  /** Closes the gamelet through the host orchestration runtime. */
  close: () => Promise<void>
  /** Reports whether the gamelet is open through the host orchestration runtime. */
  isOpen: () => Promise<boolean>
}

/**
 * Creates and mounts a module-scoped Tamagotchi gamelet.
 *
 * Use when:
 * - Extension authors need an iframe-backed gamelet with a stable module binding id
 * - Tool handlers need to retain a handle for future gamelet orchestration calls
 *
 * Expects:
 * - `module` is an {@link ExtensionModuleRef} with access to {@link gameletKit}
 * - `options.indexPath` points at the gamelet iframe HTML asset
 *
 * Returns:
 * - A handle containing the local id, host binding id, initial config, and orchestration methods
 */
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

  const handle: GameletHandle<TInit> = {
    id,
    bindingId,
    open: async (payload?: HostDataRecord) => {
      await requireOrchestration(gamelets).open(bindingId, payload)
    },
    configure: async (payload: HostDataRecord) => {
      await requireOrchestration(gamelets).configure(bindingId, payload)
    },
    request: async <TResponse = HostDataRecord>(
      payload: HostDataRecord,
      options?: { timeoutMs?: number },
    ): Promise<TResponse> => {
      return await requireOrchestration(gamelets).request<TResponse>(bindingId, payload, options)
    },
    close: async () => {
      await requireOrchestration(gamelets).close(bindingId)
    },
    isOpen: async () => await requireOrchestration(gamelets).isOpen(bindingId),
  }

  module.subscriptions.add({
    async dispose() {
      await gamelets.orchestration?.close(bindingId)
    },
  })

  if (options.init === undefined) {
    return handle
  }

  return {
    ...handle,
    init: options.init,
  }
}

export { gameletKit }

function requireOrchestration(gamelets: Awaited<ReturnType<typeof gameletKit.createClient>>): NonNullable<typeof gamelets.orchestration> {
  if (!gamelets.orchestration) {
    throw new Error(GAMELET_RUNTIME_UNAVAILABLE_MESSAGE)
  }

  return gamelets.orchestration
}
