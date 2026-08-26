import { tool } from '@xsai/tool'
import { z } from 'zod'

import { useSpine } from '../stores/spine'

interface SpineToolResult {
  data?: unknown
  error?: string
  success: boolean
}

function ensureModelLoaded(): null | SpineToolResult {
  const store = useSpine()
  if (!store.isModelLoaded)
    return { error: 'No Spine model is currently loaded.', success: false }
  return null
}

function serialize(result: SpineToolResult): string {
  return JSON.stringify(result)
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
    description: [
      'Play a Spine animation on the loaded model.',
      'By default, replaces the looping idle animation; pass `oneShot: true` to layer the animation on top of the idle loop and revert when it finishes.',
      'Animation names are case-insensitive; partial matches are accepted.',
    ].join(' '),
    execute: async ({ loop, name, oneShot }) => {
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
          data: { loop: loop ?? false, mode: 'one-shot', queued: name },
          success: true,
        })
      }

      store.currentAnimation = { loop: loop ?? true, name, nonce: (store.currentAnimation.nonce ?? 0) + 1 }
      return serialize({ data: { idle: name, loop: loop ?? true }, success: true })
    },
    name: 'spine_play_animation',
    parameters: z.object({
      loop: z.boolean().optional().describe('Whether the animation should loop. Defaults to true.'),
      name: z.string().describe('Spine animation name (e.g. "idle", "walk", "celebrate"). Case-insensitive partial match accepted.'),
      oneShot: z.boolean().optional().describe('Play once on the emotion track instead of replacing the idle loop.'),
    }),
  }),

  tool({
    description: 'List every animation available on the currently loaded Spine skeleton.',
    execute: async () => {
      const err = ensureModelLoaded()
      if (err)
        return serialize(err)
      const store = useSpine()
      return serialize({ data: store.availableAnimations, success: true })
    },
    name: 'spine_list_animations',
    parameters: z.object({}),
  }),

  tool({
    description: 'Switch the active skin. Skins are model-defined variants (different costumes/colours).',
    execute: async ({ name }) => {
      const err = ensureModelLoaded()
      if (err)
        return serialize(err)

      const store = useSpine()
      const exists = store.availableSkins.some(skin => skin.name === name)
      if (!exists) {
        return serialize({
          error: `Skin "${name}" not found. Available: ${store.availableSkins.map(skin => skin.name).join(', ')}`,
          success: false,
        })
      }
      store.currentSkin = name
      return serialize({ data: { skin: name }, success: true })
    },
    name: 'spine_set_skin',
    parameters: z.object({
      name: z.string().describe('Skin name as defined in the skeleton.'),
    }),
  }),

  tool({
    description: 'List every skin defined on the currently loaded Spine skeleton.',
    execute: async () => {
      const err = ensureModelLoaded()
      if (err)
        return serialize(err)
      const store = useSpine()
      return serialize({ data: store.availableSkins, success: true })
    },
    name: 'spine_list_skins',
    parameters: z.object({}),
  }),
]
