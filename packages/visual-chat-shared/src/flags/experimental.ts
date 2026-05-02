import { envBool } from '../env/common'

export function isRecordingEnabled(): boolean {
  return envBool('VISUAL_CHAT_RECORDING', false)
}
