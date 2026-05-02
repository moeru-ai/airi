import { getVisualChatDir } from './app-paths'

export function getLogPath(): string {
  return getVisualChatDir('logs')
}
