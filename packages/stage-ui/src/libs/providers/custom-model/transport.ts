import type { FetchTransportPort } from '@proj-airi/core-agent'

import { createDirectFetchTransport, ModelConnectionError } from '@proj-airi/core-agent'
import { isStageTamagotchi } from '@proj-airi/stage-shared'

/** Platform that owns custom-model network requests. */
export type CustomModelTransportPlatform = 'web' | 'electron'

export interface CreateCustomModelFetchTransportOptions {
  /**
   * Transport platform. When omitted, Electron is selected only inside the
   * desktop app build.
   */
  platform?: CustomModelTransportPlatform
  /**
   * Fetch implementation for the Web direct transport.
   *
   * @default globalThis.fetch
   */
  fetch?: typeof globalThis.fetch
  /**
   * Main Process Eventa transport used on Electron.
   *
   * Required when `platform` is `electron` and no transport is registered.
   */
  electron?: FetchTransportPort
}

let registeredElectronTransport: FetchTransportPort | undefined

/**
 * Registers the Electron Eventa Fetch Transport Port.
 *
 * The desktop renderer must call this once at startup. Web must not register
 * a transport.
 */
export function registerCustomModelElectronTransport(transport: FetchTransportPort): void {
  registeredElectronTransport = transport
}

/**
 * Clears the registered Electron transport.
 *
 * Tests call this after they register a fake transport.
 */
export function resetCustomModelElectronTransportForTesting(): void {
  registeredElectronTransport = undefined
}

/**
 * Resolves the custom-model transport platform for the current app build.
 */
export function resolveCustomModelTransportPlatform(): CustomModelTransportPlatform {
  return isStageTamagotchi() ? 'electron' : 'web'
}

/**
 * Creates the Fetch Transport Port for the current platform.
 *
 * Web always uses browser `fetch` against the resolved upstream URL. Electron
 * always uses the Main Process Eventa transport. The factory does not retry a
 * failed Web request through a proxy.
 */
export function createCustomModelFetchTransport(
  options: CreateCustomModelFetchTransportOptions = {},
): FetchTransportPort {
  const platform = options.platform ?? resolveCustomModelTransportPlatform()
  if (platform === 'electron') {
    const transport = options.electron ?? registeredElectronTransport
    if (!transport) {
      throw new ModelConnectionError({
        stage: 'transport',
        code: 'invalid-config',
        message: 'Electron custom model transport is missing.',
        retryable: false,
      })
    }
    return transport
  }

  return createDirectFetchTransport({ fetch: options.fetch })
}
