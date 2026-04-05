import { getVisualChatDir } from './app-paths'

export function getCachePath(): string {
  return getVisualChatDir('cache')
}
