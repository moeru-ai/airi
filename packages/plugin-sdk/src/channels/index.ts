import type { EventContext } from '@moeru/eventa'
import type {
  ExtensionIdentity,
  ExtensionModuleIdentity,
} from '@proj-airi/plugin-protocol/types'

import { createContext } from '@moeru/eventa'

/**
 * Describes one extension-scoped Eventa channel context.
 */
export interface ExtensionChannelScope {
  /** Eventa context that carries scoped extension/module traffic. */
  context: EventContext<any, any>
  /** Extension session identity associated with this scope. */
  identity: ExtensionIdentity
}

/**
 * Describes one module-scoped Eventa channel context.
 */
export interface ModuleChannelScope {
  /** Eventa context shared with the owning extension scope. */
  context: EventContext<any, any>
  /** Module identity associated with this scope. */
  identity: ExtensionModuleIdentity
}

/**
 * Creates an extension-scoped channel context.
 *
 * Use when:
 * - A host or transport adapter starts one extension session
 * - Code needs identity metadata attached beside the Eventa context
 *
 * Expects:
 * - `extensionId` is the stable extension id
 * - `context` is already bound to the desired transport when provided
 *
 * Returns:
 * - Extension identity plus the Eventa context used by child module scopes
 */
export function createExtensionChannelScope(input: {
  context?: EventContext<any, any>
  extensionId: string
  sessionId?: string
  version?: string
}): ExtensionChannelScope {
  return {
    context: input.context ?? createContext(),
    identity: {
      id: input.extensionId,
      sessionId: input.sessionId,
      version: input.version,
    },
  }
}

/**
 * Creates a module-scoped channel context from an extension scope.
 *
 * Use when:
 * - An extension registers a module that needs scoped protocol identity
 *
 * Expects:
 * - `extension` is the owning extension channel scope
 * - `moduleId` is stable within that extension session
 *
 * Returns:
 * - Module identity plus the same Eventa context used by the extension
 */
export function createModuleChannelScope(
  extension: ExtensionChannelScope,
  input: { labels?: Record<string, string>, moduleId: string },
): ModuleChannelScope {
  return {
    context: extension.context,
    identity: {
      extension: extension.identity,
      id: input.moduleId,
      labels: input.labels,
    },
  }
}
