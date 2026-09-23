import { registerPlugin } from '@capacitor/core'

interface MicrophonePermissionState {
  granted: boolean
}

interface MicrophonePermissionPlugin {
  checkPermission: () => Promise<MicrophonePermissionState>
}

/** Reads Android's native microphone permission state without triggering a permission request. */
export const MicrophonePermission = registerPlugin<MicrophonePermissionPlugin>('MicrophonePermission')
