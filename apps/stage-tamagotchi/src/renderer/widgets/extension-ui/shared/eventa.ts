import type { PluginHostModuleSummary } from '../../../../shared/eventa'

import { defineEventa } from '@moeru/eventa'

export const extensionUiBridgeEventaChannel = 'airi:extension-ui:bridge'

/**
 * Initializes an extension UI iframe with the latest host-side snapshot.
 *
 * Use when:
 * - A module iframe finishes loading and needs its initial model
 * - Host-side props or config changed and the iframe should resync
 *
 * Expects:
 * - `config` and `props` are structured-clone-safe records
 * - `module` is the currently inspected module snapshot when available
 *
 * Returns:
 * - The payload forwarded from host to iframe over the Eventa bridge
 */
export interface ExtensionUiBridgeInitPayload {
  moduleId?: string
  module?: PluginHostModuleSummary
  config: Record<string, unknown>
  props: Record<string, unknown>
}

/**
 * Structured-clone-safe module bridge payload.
 *
 * Use when:
 * - An iframe publishes a channel envelope to the host
 * - The host forwards a channel envelope back into the iframe
 *
 * Expects:
 * - Consumers validate envelope fields at the boundary
 *
 * Returns:
 * - A generic message envelope that stays transport-agnostic
 */
export type ExtensionUiBridgeEnvelope = Record<string, unknown>

export const extensionUiBridgeInitEvent = defineEventa<ExtensionUiBridgeInitPayload>('eventa:event:extension-ui:bridge:init')
export const extensionUiBridgeReadyEvent = defineEventa<void>('eventa:event:extension-ui:bridge:ready')
export const extensionUiBridgePublishEvent = defineEventa<ExtensionUiBridgeEnvelope>('eventa:event:extension-ui:bridge:publish')
export const extensionUiBridgeBroadcastEvent = defineEventa<ExtensionUiBridgeEnvelope>('eventa:event:extension-ui:bridge:broadcast')
