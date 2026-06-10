import type { WebSocketEvents } from '@proj-airi/server-sdk'
import type { JsonSchema } from 'xsschema'

import { normalizeNullableAnyOf, normalizeSparkCommandGuidanceOptions } from '@proj-airi/stage-ui/tools/character/orchestrator/spark-command-shared'
import { rawTool } from '@xsai/tool'
import { toJsonSchema } from 'xsschema'
import { z } from 'zod/v4'

/**
 * Module id the in-game bot registers under. Targeting the relay at it directly (rather than an empty
 * destinations array) is required: the adapter sends straight over the channel, so an empty array
 * would match no peer (`matchesDestinations([], peer)` is `[].some(...)` → false) and the command would
 * be dropped before reaching the bot. The bare module id matches by name / plugin id / instance (glob).
 */
const MINECRAFT_BOT_DESTINATION = 'minecraft-bot'

/** Control kind for a relay: perform the action, or stop the bot's current work. */
export type RelayToMinecraftControl = 'do' | 'stop'

/** Info handed to the optional observability hook each time a relay is emitted. */
export interface RelayToMinecraftInfo {
  task: string
  control: RelayToMinecraftControl
  ack?: string
}

export interface CreateRelayToMinecraftToolOptions {
  /**
   * Sends the assembled `spark:command` over the AIRI channel. The command itself targets the
   * Minecraft bot directly; the caller only owns the transport write.
   */
  sendSparkCommand: (command: WebSocketEvents['spark:command']) => void
  /**
   * Re-checks, at execution time, whether the in-game bot is still connected. The tool is only
   * REGISTERED while the bot is online, but it can disconnect between registration and the model
   * invoking it — so execute() refuses (instead of acking a command with no live recipient) when
   * this returns false.
   */
  isAvailable: () => boolean
  /** Optional observability hook: called after each successful relay (e.g. to log into a panel). */
  onRelay?: (info: RelayToMinecraftInfo) => void
}

// NOTICE:
// The bot side (services/minecraft airi-bridge.handleActionIntent) uses `guidance.options[0].label`
// as the message it relays to its brain (label preferred; steps only as fallback). So `label` MUST
// carry the FULL task text, not a truncated display label — otherwise the brain receives a clipped
// instruction.
const relayToMinecraftToolSchema = z.object({
  task: z
    .string()
    .min(1)
    .describe('The action to perform in the Minecraft world, described in natural language. Example: "follow me to that forest and chop oak logs" or "put the cobblestone from your inventory into the nearest chest".'),
  ack: z
    .union([z.string(), z.null()])
    .describe('A brief maid-style acknowledgement for the master, such as "Yes, master, right away." Use null when no acknowledgement is needed.'),
  control: z
    .union([z.enum(['do', 'stop']), z.null()])
    .describe('"do" means perform the action (default). "stop" means immediately stop the in-game action currently in progress, for requests such as stop, cancel, come back, or do not do that.'),
}).strict()

/**
 * Builds the desktop-side `relayToMinecraft` tool.
 *
 * Use when:
 * - The character LLM decides the master wants the in-game Airi to do (or stop) something.
 *
 * Why a dedicated tool instead of the generic `builtIn_emitSparkCommand`:
 * - The LLM only supplies a natural-language `task` (+ optional `ack`/`control`); this tool builds
 *   the full `spark:command` deterministically (intent/interrupt/priority/guidance), so malformed
 *   payloads from the model are no longer possible.
 * - The Minecraft adapter only registers it while the bot is online, turning the previous prompt-only
 *   "don't relay when offline" into a hard capability gate, and `isAvailable()` closes the small
 *   registration→invocation window where the bot may have just disconnected.
 *
 * Returns:
 * - A one-element tool array (matching the generic spark-command tool's shape).
 */
export async function createRelayToMinecraftTool(options: CreateRelayToMinecraftToolOptions) {
  // NOTICE: bypass `tool(...)` and normalize the JSON Schema for the same provider-compat reason as
  // createSparkCommandTool (Azure/OpenAI-compatible validators reject some nullable `anyOf` forms).
  const parameters = normalizeNullableAnyOf(await toJsonSchema(relayToMinecraftToolSchema) as JsonSchema)

  return [
    rawTool({
      name: 'relayToMinecraft',
      description: [
        'Relay the master\'s Minecraft-world instruction to the in-game Airi, your other body, so she can execute it.',
        'Call only when the master wants something done in Minecraft: move, follow, come here, go to coordinates, mine, chop trees, collect items, build, place blocks, fight mobs, manage inventory, go home, find something, or stop/cancel/come back.',
        'Do not call for pure chat, greetings, praise, or questions about your status or mood. For those, respond normally in character.',
      ].join(''),
      parameters,
      execute: async (rawPayload) => {
        // The bot may have de-announced between tool registration and this invocation.
        if (!options.isAvailable())
          return 'relayToMinecraft: the in-game Airi is offline, so the instruction was not sent. Wait until she reconnects before relaying it.'

        const payload = rawPayload as z.infer<typeof relayToMinecraftToolSchema>
        const task = (payload.task ?? '').trim()
        if (!task)
          return 'relayToMinecraft: received an empty task, so nothing was relayed.'

        const control: RelayToMinecraftControl = payload.control ?? 'do'
        const ack = payload.ack ?? undefined
        const isStop = control === 'stop'

        // label is what the bot relays to its brain → keep the full instruction, never truncate.
        const label = isStop
          ? `Immediately stop all in-game actions currently in progress${task ? ` (${task})` : ''}`
          : task
        const steps = isStop
          ? Array.from(new Set(['Stop every current action', task].filter(Boolean)))
          : [task]

        const command = {
          id: crypto.randomUUID(),
          eventId: crypto.randomUUID(),
          parentEventId: undefined,
          commandId: crypto.randomUUID(),
          // stop preempts in-flight work; normal relays ride the bot's soft-interrupt queue.
          interrupt: isStop ? 'force' : 'soft',
          priority: isStop ? 'high' : 'normal',
          intent: 'action',
          ack,
          guidance: {
            type: 'instruction',
            persona: undefined,
            options: normalizeSparkCommandGuidanceOptions([{
              label,
              steps,
              rationale: null,
              possibleOutcome: null,
              risk: null,
              fallback: null,
              triggers: null,
            }]),
          },
          contexts: undefined,
          // Target the bot directly — see MINECRAFT_BOT_DESTINATION. An empty array would be preserved
          // by the channel send and match no peer, silently dropping the relay.
          destinations: [MINECRAFT_BOT_DESTINATION],
        } satisfies WebSocketEvents['spark:command']

        options.sendSparkCommand(command)
        options.onRelay?.({ task, control, ack })

        return isStop
          ? 'The in-game Airi has been told to stop her current action.'
          : `The instruction has been relayed to the in-game Airi: ${task}`
      },
    }),
  ]
}
