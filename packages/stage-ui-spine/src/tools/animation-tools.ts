import { tool } from '@xsai/tool'
import { z } from 'zod'

import { useSpine } from '../stores/spine'

interface SpineToolResult {
  success: boolean
  data?: unknown
  error?: string
}

function serialize(result: SpineToolResult): string {
  return JSON.stringify(result)
}

function ensureModelLoaded(): SpineToolResult | null {
  const store = useSpine()
  if (!store.isModelLoaded)
    return { success: false, error: 'No Spine model is currently loaded.' }
  return null
}

/**
 * LLM-callable tools for controlling the active Spine model.
 *
 * Use when:
 * - The chat orchestrator wires up tools for the active provider.
 *
 * Expects:
 * - A Spine model is the active stage renderer; otherwise tool calls
 *   short-circuit with `success: false`.
 */
export const tools = [
  tool({
    name: 'spine_play_animation',
    description: [
      'Play a Spine animation on the loaded model.',
      'By default, replaces the looping idle animation; pass `oneShot: true` to layer the animation on top of the idle loop and revert when it finishes.',
      'Animation names are case-insensitive; partial matches are accepted.',
    ].join(' '),
    execute: async ({ name, oneShot, loop }) => {
      const err = ensureModelLoaded()
      if (err)
        return serialize(err)

      const store = useSpine()
      if (oneShot) {
        // One-shot plays on the dedicated emotion track over the persistent
        // idle loop and reverts when it completes. The scene watches
        // `oneShotAnimation` and resolves the closest matching name.
        store.playOneShotAnimation(name, loop ?? false)
        return serialize({
          success: true,
          data: { queued: name, mode: 'one-shot', loop: loop ?? false },
        })
      }

      store.currentAnimation = { name, loop: loop ?? true, nonce: (store.currentAnimation.nonce ?? 0) + 1 }
      return serialize({ success: true, data: { idle: name, loop: loop ?? true } })
    },
    parameters: z.object({
      name: z.string().describe('Spine animation name (e.g. "idle", "walk", "celebrate"). Case-insensitive partial match accepted.'),
      loop: z.boolean().optional().describe('Whether the animation should loop. Defaults to true.'),
      oneShot: z.boolean().optional().describe('Play once on the emotion track instead of replacing the idle loop.'),
    }),
  }),

  tool({
    name: 'spine_list_animations',
    description: 'List every animation available on the currently loaded Spine skeleton.',
    execute: async () => {
      const err = ensureModelLoaded()
      if (err)
        return serialize(err)
      const store = useSpine()
      return serialize({ success: true, data: store.availableAnimations })
    },
    parameters: z.object({}),
  }),

  tool({
    name: 'spine_set_skin',
    description: 'Switch the active skin. Skins are model-defined variants (different costumes/colours).',
    execute: async ({ name }) => {
      const err = ensureModelLoaded()
      if (err)
        return serialize(err)

      const store = useSpine()
      const exists = store.availableSkins.some(skin => skin.name === name)
      if (!exists) {
        return serialize({
          success: false,
          error: `Skin "${name}" not found. Available: ${store.availableSkins.map(skin => skin.name).join(', ')}`,
        })
      }
      store.currentSkin = name
      return serialize({ success: true, data: { skin: name } })
    },
    parameters: z.object({
      name: z.string().describe('Skin name as defined in the skeleton.'),
    }),
  }),

  tool({
    name: 'spine_list_skins',
    description: 'List every skin defined on the currently loaded Spine skeleton.',
    execute: async () => {
      const err = ensureModelLoaded()
      if (err)
        return serialize(err)
      const store = useSpine()
      return serialize({ success: true, data: store.availableSkins })
    },
    parameters: z.object({}),
  }),
]
