import type { ModuleCognition } from '@proj-airi/server-sdk'

import { defineStore } from 'pinia'
import { array, object, optional, safeParse, string } from 'valibot'
import { shallowRef } from 'vue'

import { useModsServerChannelStore } from './channel-server'

const cognitionSchema = object({
  scenes: optional(array(object({ binding: string() }))),
})

/** One connected module and its validated declaration. */
interface DirectoryModule {
  name: string
  /** The module identity id from the server's list. One connection can carry several modules. */
  identityId?: string
  connectionId?: string
  /** Absent when the module declared nothing or sent an invalid declaration. */
  cognition?: ModuleCognition
  /** Set when the declaration was invalid. The host then refuses the module's input. */
  declarationError?: string
}

/** Validates a declaration. Scene bindings must stay in the module's own namespace, so a module cannot claim another scene. */
function validateCognition(name: string, value: unknown): Pick<DirectoryModule, 'cognition' | 'declarationError'> {
  if (value === undefined)
    return {}
  const result = safeParse(cognitionSchema, value)
  if (!result.success)
    return { declarationError: 'Invalid cognition declaration' }
  if (result.output.scenes?.some(scene => !scene.binding.startsWith(`${name}:`)))
    return { declarationError: `Scene bindings must start with "${name}:"` }
  return { cognition: result.output }
}

/** Where an input can go, after the sender's declaration. */
type InputSceneResult
  = | { ok: true, overrides?: InputOverrides }
    | { ok: false, reason: 'invalid-declaration' | 'undeclared-scene' | 'unknown-sender' }

/** A connection with several modules, where the input names none of them. Its declaration is unknown. */
const AMBIGUOUS_SENDER = 'ambiguous-sender'

interface InputOverrides {
  binding?: string
  sessionId?: string
}

/**
 * Applies the sender's scene declaration to an input.
 *
 * Returns:
 * - A rejection when the sender's module is unknown on a connection with several modules.
 * - The overrides unchanged for a module without scenes, which speaks for the owner.
 * - For a module with scenes, its binding only when a declared scene matches. It can never name a session.
 * - A rejection for an invalid declaration or a binding outside the declared scenes.
 */
export function resolveInputScene<T extends InputOverrides>(module: DirectoryModule | typeof AMBIGUOUS_SENDER | undefined, overrides: T | undefined): { ok: true, overrides?: T } | Extract<InputSceneResult, { ok: false }> {
  if (module === AMBIGUOUS_SENDER)
    return { ok: false, reason: 'unknown-sender' }
  if (module?.declarationError)
    return { ok: false, reason: 'invalid-declaration' }
  const scenes = module?.cognition?.scenes
  if (!scenes?.length)
    return { ok: true, overrides }
  const binding = overrides?.binding
  if (!binding || !scenes.some(scene => binding.startsWith(scene.binding)))
    return { ok: false, reason: 'undeclared-scene' }
  return { ok: true, overrides: { ...overrides, sessionId: undefined } as T }
}

/**
 * Connected modules and their declarations, from the server's module list.
 *
 * Use when:
 * - Input handling needs the declaration of an event's origin connection.
 *
 * Expects:
 * - Each renderer calls {@link listen} once while its server channel runs.
 *
 * Returns:
 * - Modules from the latest server list. An invalid declaration counts as none.
 */
export const useModuleDirectoryStore = defineStore('mods:api:module-directory', () => {
  const serverChannel = useModsServerChannelStore()
  const modules = shallowRef<DirectoryModule[]>([])

  /**
   * Finds the module that sent an event, from its server-assigned connection and its claimed identity.
   *
   * Returns:
   * - Undefined for a connection without modules, which speaks for the owner.
   * - The module whose identity the event names, or the only module of the connection when the event names none.
   * - {@link AMBIGUOUS_SENDER} when the named identity is not on the connection, or several modules leave the sender unknown.
   */
  function senderOf(connectionId: string | undefined, identityId: string | undefined): DirectoryModule | typeof AMBIGUOUS_SENDER | undefined {
    const onConnection = connectionId ? modules.value.filter(module => module.connectionId === connectionId) : []
    if (!onConnection.length)
      return undefined
    if (identityId)
      return onConnection.find(module => module.identityId === identityId) ?? AMBIGUOUS_SENDER
    return onConnection.length === 1 ? onConnection[0] : AMBIGUOUS_SENDER
  }

  /** The registered name of the module with this identity. Names stay the same across restarts, unlike instance ids. */
  function nameOf(identityId: string | undefined) {
    return identityId ? modules.value.find(module => module.identityId === identityId)?.name : undefined
  }

  function listen() {
    return serverChannel.onEvent('registry:modules:sync', (event) => {
      // The server never stamps its own events with a sender. A stamped list came from a peer.
      if (event.metadata?.sender)
        return
      modules.value = event.data.modules.map(module => ({
        name: module.name,
        identityId: module.identity?.id,
        connectionId: module.connectionId,
        ...validateCognition(module.name, module.cognition),
      }))
    })
  }

  return {
    modules,
    senderOf,
    nameOf,
    listen,
  }
})
