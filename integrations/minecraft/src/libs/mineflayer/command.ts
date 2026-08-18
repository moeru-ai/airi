export interface CommandContext {
  sender: string
  isCommand: boolean
  command: string
  args: string[]
}

export function parseCommand(sender: string, message: string): CommandContext {
  const isCommand = message.startsWith('#')
  const command = message.split(' ')[0]
  const args = message.split(' ').slice(1)
  return { sender, isCommand, command, args }
}
