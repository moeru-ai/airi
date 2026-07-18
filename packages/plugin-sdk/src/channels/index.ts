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
  /** Extension session identity associated with this scope. */
  identity: ExtensionIdentity
  /** Eventa context that carries scoped extension/module traffic. */
  context: EventContext<any, any>
}

/**
 * Describes one module-scoped Eventa channel context.
 */
export interface ModuleChannelScope {
  /** Module identity associated with this scope. */
  identity: ExtensionModuleIdentity
  /** Eventa context shared with the owning extension scope. */
  context: EventContext<any, any>
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
  extensionId: string
  sessionId?: string
  version?: string
  context?: EventContext<any, any>
}): ExtensionChannelScope {
  return {
    identity: {
      id: input.extensionId,
      sessionId: input.sessionId,
      version: input.version,
    },
    context: input.context ?? createContext(),
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
  input: { moduleId: string, labels?: Record<string, string> },
): ModuleChannelScope {
  return {
    identity: {
      id: input.moduleId,
      extension: extension.identity,
      labels: input.labels,
    },
    context: extension.context,
  }
}
