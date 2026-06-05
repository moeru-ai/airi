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
   * Sends the assembled `spark:command` over the AIRI channel. Reuses the same broadcast path the
   * generic spark-command tool uses (`destinations: []`), so relay routing stays consistent with it.
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
    .describe('要在游戏世界里执行的动作,用自然语言完整描述。例如 "跟着我去那片树林砍橡木" 或 "把背包里的圆石放进最近的箱子"。'),
  ack: z
    .union([z.string(), z.null()])
    .describe('给主人的简短女仆口吻应答,例如 "好的主人,这就去~"。无需应答时为 null。'),
  control: z
    .union([z.enum(['do', 'stop']), z.null()])
    .describe('"do"=执行该动作(默认);"stop"=立刻停下游戏里正在进行的动作(用于"停下/别做了/回来/取消"等)。'),
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
        '把主人对游戏世界的指令派给游戏里的 Airi(你的另一个身体)去执行。',
        '仅当主人要在 Minecraft 里做事时调用:移动/跟随/过来/去坐标、挖矿/砍树/收集、搭建/放置、打怪、整理背包、回家/找东西、以及"停下/别做了/回来"等。',
        '纯闲聊、问候、夸奖、问你状态或心情时【不要】调用,正常用人设回应即可。',
      ].join(''),
      parameters,
      execute: async (rawPayload) => {
        // The bot may have de-announced between tool registration and this invocation.
        if (!options.isAvailable())
          return 'relayToMinecraft: 游戏里的 Airi 现在不在线,指令没有发出去。等她上线后再让我转达吧。'

        const payload = rawPayload as z.infer<typeof relayToMinecraftToolSchema>
        const task = (payload.task ?? '').trim()
        if (!task)
          return 'relayToMinecraft: 收到空 task,未转发。'

        const control: RelayToMinecraftControl = payload.control ?? 'do'
        const ack = payload.ack ?? undefined
        const isStop = control === 'stop'

        // label is what the bot relays to its brain → keep the full instruction, never truncate.
        const label = isStop
          ? `立刻停下游戏里正在进行的所有动作${task && task !== '停下' ? `(${task})` : ''}`
          : task
        const steps = isStop
          ? Array.from(new Set(['停止当前所有动作', task].filter(Boolean)))
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
          ? '已让游戏里的 Airi 停下当前动作。'
          : `已把指令派给游戏里的 Airi 执行:${task}`
      },
    }),
  ]
}
