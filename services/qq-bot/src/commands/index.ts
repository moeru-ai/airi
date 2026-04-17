import type { CommandsConfig } from '../config.js'
import type { CommandHandler } from './types.js'

import { clearCommand } from './clear.js'
import { helpCommand } from './help.js'
import { statusCommand } from './status.js'

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
