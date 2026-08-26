import { registerPlugin } from '@capacitor/core'

interface MicrophonePermissionPlugin {
  checkPermission: () => Promise<MicrophonePermissionState>
}

interface MicrophonePermissionState {
  granted: boolean
}

/** Reads Android's native microphone permission state without triggering a permission request. */
export const MicrophonePermission = registerPlugin<MicrophonePermissionPlugin>('MicrophonePermission')
