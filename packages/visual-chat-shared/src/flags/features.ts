import { envBool } from '../env/common'

export function isFullDuplexEnabled(): boolean {
  return envBool('VISUAL_CHAT_FULL_DUPLEX', false)
}

export function isAutoSourceSwitchEnabled(): boolean {
  return envBool('VISUAL_CHAT_AUTO_SOURCE_SWITCH', false)
}
