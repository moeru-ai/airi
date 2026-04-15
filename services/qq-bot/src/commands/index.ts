import type { CommandsConfig } from '../config'
import type { CommandHandler } from './types'

import { clearCommand } from './clear'
import { helpCommand } from './help'
import { statusCommand } from './status'

export interface CommandRegistry {
  prefix: string
  handlers: Map<string, CommandHandler>
}

const BUILTIN_COMMANDS: Record<string, CommandHandler> = {
  clear: clearCommand,
  help: helpCommand,
  status: statusCommand,
}

export function createCommandRegistry(config: CommandsConfig): CommandRegistry {
  const resolvedConfig = config ?? {
    prefix: '/',
    enabled: ['help', 'status', 'new', 'switch', 'history', 'clear'],
  }
  const handlers = new Map<string, CommandHandler>()
  for (const commandName of resolvedConfig.enabled) {
    const handler = BUILTIN_COMMANDS[commandName]
    if (handler)
      handlers.set(commandName, handler)
  }

  return {
    prefix: resolvedConfig.prefix,
    handlers,
  }
}
