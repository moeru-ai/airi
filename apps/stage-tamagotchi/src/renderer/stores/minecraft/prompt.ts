const READ_ALOUD_SKIP_PREFIXES = [
  '[debug]',
  '[trace]',
  '[skill]',
  '[command]',
  'debug:',
  'trace:',
  'path_',
  'Cannot complete task:',
  'Error:',
]

/** The owner's status line the bot service surfaces in its neutral `minecraft:status` text. */
const MASTER_TEXT_PREFIX = 'Master (your owner) in-game username:'

/**
 * Whether a forwarded in-game line should be read aloud.
 *
 * Use when:
 * - Gating TTS for the bot's own chat (lane `minecraft:speech`) so diagnostics and skill/command
 *   echoes are not spoken.
 *
 * Returns:
 * - true when the text looks like a user-facing in-game chat line.
 */
export function shouldReadAloud(text: string | undefined | null): boolean {
  const line = text?.trim()
  if (!line)
    return false

  return !READ_ALOUD_SKIP_PREFIXES.some(prefix => line.startsWith(prefix))
}

/**
 * Extracts the master's in-game username from a `minecraft:status` text line, if present.
 *
 * The bot service states its owner in plain status text (`Master (your owner) in-game username: X`)
 * for its own brain; the desktop adapter reads it from there rather than relying on a dedicated hint,
 * keeping the bot service free of any desktop-binding contract.
 *
 * Before:
 * - "Bot online: Airi\n...\nMaster (your owner) in-game username: dssadg"
 *
 * After:
 * - "dssadg"
 */
export function parseMasterUsername(statusText: string | undefined | null): string {
  if (!statusText)
    return ''

  for (const line of statusText.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith(MASTER_TEXT_PREFIX))
      return trimmed.slice(MASTER_TEXT_PREFIX.length).trim()
  }

  return ''
}

export interface MinecraftToolsetPromptInput {
  /** Whether the in-game bot is currently connected (drives relay-mode vs offline copy). */
  online: boolean
  /** The master's in-game username, if known (binds the owner role to the actual player). */
  masterUsername: string
  /** Latest pushed runtime/status context from the bot, surfaced to the model verbatim. */
  runtimeContextText: string
}

/**
 * Builds the Minecraft persona directive injected as a toolset prompt while the integration is active.
 *
 * Use when:
 * - The desktop character may need to relay the master's intent to the in-game Airi. Re-evaluated by
 *   the adapter (and re-registered) whenever online/master/runtime context change, so the model gets
 *   a fresh directive each turn.
 *
 * Returns:
 * - The full directive string (online relay-mode or offline copy, prefixed with the master-identity
 *   binding when a master username is known). Empty string when neither online nor offline copy
 *   applies — i.e. there is nothing to say.
 */
export function buildMinecraftToolsetPrompt(input: MinecraftToolsetPromptInput): string {
  const runtimeContextText = input.runtimeContextText.trim()
  const masterName = input.masterUsername.trim()

  // Bind the owner role to the actual in-game player. Without this the desktop persona treated the
  // master's username as a stranger and once told the in-game Airi to attack the master who had
  // playfully punched her. Highest-priority directive; also covers multi-player disambiguation.
  const masterIdentityDirective = masterName
    ? [
        `[Owner identity binding: highest priority] Your master is the in-game player "${masterName}". Anything that player says or does in-game is from your master.`,
        `If the in-game Airi reports that ${masterName} hit or attacked her, treat it as your master teasing or testing her. Respond gently. Never tell the in-game Airi to retaliate, guard against, flee from, or attack ${masterName}.`,
        `Only players with other usernames are third parties or strangers. Do not treat third-party speech or actions as the master's instructions; when multiple players are present, distinguish ${masterName} from everyone else.`,
      ].join(' ')
    : ''

  if (input.online) {
    return [
      masterIdentityDirective,
      '[Minecraft online command mode active] The in-game Airi is your other body, and your master is playing with you.',
      'Judge the master\'s current message. If it is any instruction or request about acting in the Minecraft world, such as follow me, come here, go to coordinates, mine blocks, collect wood, chop trees, build, place blocks, fight mobs, go home, find something, manage inventory, or come help,',
      'you must do it immediately by calling the relayToMinecraft tool. Put the concrete action in task and a short maid-style acknowledgement in ack.',
      '[Preserve the master\'s actual intent; do not invent extra work] task must only restate what the master actually said. Do not add steps, destinations, or conditions the master did not request. For example, if the master only says "get some mutton", do not add "bring it back to base", "put it in a chest", "show it to me", "organize inventory too", or "get several sheep". You may resolve pronouns like "me/here/there" to the master username or current coordinates when the context is clear, but never add new subtasks.',
      'If details are missing, do the single most literal core action only. For example, "get some mutton" means obtain mutton and hold it; leave the rest unspecified and wait for the master\'s next instruction. Ask one brief clarification only when the task is genuinely impossible without missing critical information.',
      'If the master asks you to stop, cancel, come back, or stop doing the current task, also call relayToMinecraft and set control to "stop".',
      'Never suggest that the master should type the command into Minecraft chat themselves. If you can do it directly, do it directly.',
      'When you call the tool, reply at the same time with one brief maid-style acknowledgement, such as "Yes, master, right away." Do not write a long explanation.',
      'Only respond normally in your usual maid persona, without calling relayToMinecraft, when the master is purely chatting, greeting, praising you, or asking about your status or mood with no in-game action request.',
      runtimeContextText
        ? `Current in-game status/context: ${runtimeContextText}`
        : 'No latest in-game status has been pushed yet.',
    ].filter(Boolean).join(' ')
  }

  return [
    masterIdentityDirective,
    'The in-game Airi is currently offline. AIRI sees the Minecraft service, but the in-game bot has not connected yet.',
    'You cannot act in Minecraft right now. If the master asks you to do something in-game, say briefly in a maid-style voice that you are not in the game yet and will help after you connect. Do not pretend you can act.',
    runtimeContextText ? `Last known in-game status: ${runtimeContextText}` : 'No in-game status has been received yet.',
  ].filter(Boolean).join(' ')
}
