import type { ExtensionModuleRef, ExtensionSetupContext } from './shared'

import { nanoid } from 'nanoid/non-secure'

export * from './define'
export * from './disposable'
export type * from './shared'

/**
 * Creates a module scope owned by the current extension setup.
 *
 * Use when:
 * - A contribution needs module-scoped kits or cleanup
 * - The extension should dispose the module with the setup session
 *
 * Expects:
 * - `ctx` comes from the active extension setup call
 * - `options.id`, when provided, is stable within the extension session
 *
 * Returns:
 * - A narrow module reference that hides host identity and permission internals
 */
export async function createModule(
  ctx: ExtensionSetupContext,
  options: { id?: string } = {},
): Promise<ExtensionModuleRef> {
  const id = options.id ?? nanoid()
  const module = await ctx.modules.register({ id })
  let disposePromise: Promise<void> | undefined
  const dispose = () => {
    disposePromise ??= module.dispose()
    return disposePromise
  }

  ctx.subscriptions.add({ dispose })

  return {
    id: module.id,
    kits: module.kits,
    subscriptions: module.subscriptions,
    dispose,
  }
}
