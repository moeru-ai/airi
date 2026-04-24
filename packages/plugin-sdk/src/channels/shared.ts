import type { EventContext } from '@moeru/eventa'

/**
 * Describes the control-plane Eventa context used between a plugin and its host.
 *
 * Use when:
 * - Typing `ContextInit.channels.host`
 * - Passing a host-backed Eventa context through plugin bootstrap code
 *
 * Expects:
 * - The context transports plugin-host lifecycle and RPC traffic
 *
 * Returns:
 * - An Eventa context whose raw transport payload may be exposed through `raw`
 */
export type ChannelHost = EventContext<unknown, { raw?: any }>
