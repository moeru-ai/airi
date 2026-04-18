import { useLogg } from '@guiiai/logg'
import { errorMessageFrom } from '@moeru/std'
import { REST, Routes, SlashCommandBuilder } from 'discord.js'

const log = useLogg('Discord:Commands').useGlobalConfig()

export const COMPANION_COMMANDS = {
  join: 'companion-join',
  leave: 'companion-leave',
  ping: 'companion-ping',
} as const

export type CompanionCommandName
  = (typeof COMPANION_COMMANDS)[keyof typeof COMPANION_COMMANDS]

/**
 * Registers the companion service slash commands with Discord's global scope.
 *
 * Use when:
 * - The Discord client has just logged in; idempotent across restarts.
 *
 * Expects:
 * - `token` and `clientId` match the same application.
 *
 * NOTICE:
 * We intentionally use a distinct `companion-*` command namespace to avoid
 * colliding with the legacy `/ping` / `/summon` commands registered by
 * `services/discord-bot`.
 */
export async function registerCompanionCommands(token: string, clientId: string): Promise<void> {
  try {
    const rest = new REST().setToken(token)
    await rest.put(Routes.applicationCommands(clientId), {
      body: [
        new SlashCommandBuilder()
          .setName(COMPANION_COMMANDS.ping)
          .setDescription('Replies with Pong to confirm the companion is online.')
          .toJSON(),
        new SlashCommandBuilder()
          .setName(COMPANION_COMMANDS.join)
          .setDescription('Summons the companion to your current voice channel.')
          .toJSON(),
        new SlashCommandBuilder()
          .setName(COMPANION_COMMANDS.leave)
          .setDescription('Disconnects the companion from the current voice channel.')
          .toJSON(),
      ],
    })
    log.log('Registered companion slash commands')
  }
  catch (error) {
    log
      .withError(error)
      .withField('message', errorMessageFrom(error) ?? 'unknown error')
      .error('Failed to register slash commands')
  }
}
