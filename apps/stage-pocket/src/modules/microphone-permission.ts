import { registerPlugin } from '@capacitor/core'

interface MicrophonePermissionState {
  granted: boolean
}

interface MicrophonePermissionPlugin {
  checkPermission: () => Promise<MicrophonePermissionState>
}

/** Reads the native microphone permission state of Android and iOS without a permission request. */
export const MicrophonePermission = registerPlugin<MicrophonePermissionPlugin>('MicrophonePermission')
