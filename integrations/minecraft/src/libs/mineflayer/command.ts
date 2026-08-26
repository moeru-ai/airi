export interface CommandContext {
  args: string[]
  command: string
  isCommand: boolean
  sender: string
}

export function parseCommand(sender: string, message: string): CommandContext {
  const isCommand = message.startsWith('#')
  const command = message.split(' ')[0]
  const args = message.split(' ').slice(1)
  return { args, command, isCommand, sender }
}
