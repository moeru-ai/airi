import { getVisualChatDir } from './app-paths'

export function getDataPath(): string {
  return getVisualChatDir('data')
}
