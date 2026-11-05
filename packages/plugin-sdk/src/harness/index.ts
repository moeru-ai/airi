import type { KitHandle } from '../kit/references'

import { createKitHandle } from '../kit/references'

/**
 * The reference harness Kit.
 *
 * It shows how a plugin changes an agent turn through harness hooks. The real AIRI harness is not wired to it yet.
 * See docs/ai/adr/2026-11-06-plugin-host-on-injeca.md, "Hooks of the harness".
 */

/** The hook events of one agent turn. */
export type HarnessHookEvent = 'context.inject' | 'context.transform'

/** One message of a turn context. */
export interface HarnessMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** The context of one agent turn that hooks can change. */
export interface HarnessTurnContext {
  turnId: string
  messages: HarnessMessage[]
  /** Context lines that hooks add for the model. */
  injected: string[]
}

/** The options of one hook listener. The harness reads them. */
export interface HarnessHookOptions {
  /** A higher priority runs first. @default 0 */
  priority?: number
  /** The time that the harness waits for this listener. @default the timeout of the run */
  timeoutMs?: number
}

/** A hook listener. It returns the changed context, or nothing to keep the context. */
export type HarnessHookHandler = (context: HarnessTurnContext) => HarnessTurnContext | void | Promise<HarnessTurnContext | void>

/** Removes one hook listener. */
export interface HarnessHookRegistration {
  dispose: () => Promise<void>
}

/** The client of the harness Kit. */
export interface HarnessKitClient {
  hooks: {
    /** Registers a hook listener. The plugin owns it, so it goes away when the plugin unloads. */
    on: (event: HarnessHookEvent, handler: HarnessHookHandler, options?: HarnessHookOptions) => Promise<HarnessHookRegistration>
  }
}

/** The id of the harness Kit. */
export const harnessKitId = 'airi.harness'

/** The version of the harness Kit contract. */
export const harnessKitVersion = '1.0.0'

/** The reference that plugins pass to `ctx.kits.get()`. */
export const harnessKit: KitHandle<HarnessKitClient> = createKitHandle<HarnessKitClient>(harnessKitId, harnessKitVersion)

const harnessEventKeys: Readonly<Record<HarnessHookEvent, { readonly id: string }>> = Object.freeze({
  'context.inject': Object.freeze({ id: `${harnessKitId}/context.inject` }),
  'context.transform': Object.freeze({ id: `${harnessKitId}/context.transform` }),
})

/** The listener event key of a hook event. The Host stores listeners under it. */
export function harnessEventKey(event: HarnessHookEvent): { readonly id: string } {
  return harnessEventKeys[event]
}
