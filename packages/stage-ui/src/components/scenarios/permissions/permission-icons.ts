import type { DevicePermissionKind } from '../../../stores/device-permissions'

/** The icon of each permission kind, for the steps, the pages, and the summary. */
export const permissionIcons: Record<DevicePermissionKind, string> = {
  'microphone': 'i-mingcute:mic-line',
  'accessibility': 'i-mingcute:keyboard-line',
  'screen-recording': 'i-mingcute:computer-line',
  'notifications': 'i-mingcute:notification-line',
}
