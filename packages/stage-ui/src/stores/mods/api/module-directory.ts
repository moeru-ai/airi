import type { ModuleCognition } from '@proj-airi/server-sdk'

import { defineStore } from 'pinia'
import { array, literal, number, object, optional, picklist, safeParse, string } from 'valibot'
import { shallowRef } from 'vue'

import { useModsServerChannelStore } from './channel-server'

const cognitionSchema = object({
  accepts: optional(array(picklist(['plan', 'proposal', 'action', 'pause', 'resume', 'reroute', 'context']))),
  control: optional(object({ exclusive: literal(true), leaseMs: optional(number()) })),
  scenes: optional(array(object({ binding: string() }))),
})

/** One connected module and its validated declaration. */
export interface DirectoryModule {
  name: string
  connectionId?: string
  /** Absent when the module declared nothing or sent an invalid declaration. */
  cognition?: ModuleCognition
  /** Set when the declaration was invalid. The host then refuses the module's input and commands. */
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

/** Where an input may go, after the sender's declaration. */
export type InputSceneResult
  = | { ok: true, overrides?: InputOverrides }
    | { ok: false, reason: 'invalid-declaration' | 'undeclared-scene' }

interface InputOverrides {
  binding?: string
  sessionId?: string
}

/**
 * Applies the sender's scene declaration to an input.
 *
 * Returns:
 * - The overrides unchanged for a module without scenes, which speaks for the owner.
 * - For a module with scenes, its binding only when a declared scene matches. It can never name a session.
 * - A rejection for an invalid declaration or a binding outside the declared scenes.
 */
export function resolveInputScene<T extends InputOverrides>(module: DirectoryModule | undefined, overrides: T | undefined): { ok: true, overrides?: T } | Extract<InputSceneResult, { ok: false }> {
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
 * Connected modules and their scheduler declarations, from the server's module list.
 *
 * Use when:
 * - Intake or command admission needs the declaration of a destination or of an event's origin connection.
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

  /** Returns the module that owns a server-assigned connection. */
  function byConnection(connectionId: string | undefined) {
    return connectionId ? modules.value.find(module => module.connectionId === connectionId) : undefined
  }

  /** Returns every connected instance of a module name. */
  function byName(name: string) {
    return modules.value.filter(module => module.name === name)
  }

  function listen() {
    return serverChannel.onEvent('registry:modules:sync', (event) => {
      // The server never stamps its own events with an origin. A stamped list came from a peer.
      if (event.metadata?.originConnectionId)
        return
      modules.value = event.data.modules.map(module => ({
        name: module.name,
        connectionId: module.connectionId,
        ...validateCognition(module.name, module.cognition),
      }))
    })
  }

  return {
    modules,
    byConnection,
    byName,
    listen,
  }
})
