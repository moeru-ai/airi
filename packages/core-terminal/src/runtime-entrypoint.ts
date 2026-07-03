import type { RegisteredTerminalCapability } from './index.js'
/**
 * AIRI Core Terminal — Runtime Entrypoint
 *
 * Conditionally registers the terminal capability into an existing
 * CapabilityRegistry + LocalToolRuntime pair. Safe to call multiple times
 * (it is a no-op if the capability is already registered).
 *
 * Use this from `core/bootstrap.ts` or from a runtime wire-up module:
 *
 *   if (process.env.AIRI_ENABLE_TERMINAL === '1') {
 *     const { tryRegisterTerminalCapability } = await import('@proj-airi/core-terminal/runtime-entrypoint')
 *     await tryRegisterTerminalCapability({ registry: capabilityRegistry, runtime: toolRuntime })
 *   }
 */
import process from 'node:process'

import { registerTerminalCapability, resolveTerminalMcpOptions } from './index.js'

export interface TryRegisterOptions {
  registry: import('@proj-airi/core').CapabilityRegistry
  runtime: import('@proj-airi/core').LocalToolRuntime
}

/**
 * Register the terminal capability iff:
 * - `AIRI_ENABLE_TERMINAL` env is `"1"`
 * - the capability isn't already registered
 *
 * Returns the registration result, or undefined if terminal is disabled.
 *
 * Throws on MCP connection or handshake failure. Callers that want to degrade
 * gracefully should wrap in try/catch and log the error.
 */
export async function tryRegisterTerminalCapability(
  options: TryRegisterOptions,
): Promise<RegisteredTerminalCapability | undefined> {
  if (process.env.AIRI_ENABLE_TERMINAL !== '1') return undefined

  return await registerTerminalCapability(options.registry, options.runtime, {
    bridgeOptions: resolveTerminalMcpOptions(),
  })
}
