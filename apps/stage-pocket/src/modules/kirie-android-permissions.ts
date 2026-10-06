import {
  defineInvoke,
  defineInvokeEventa,
} from '@moeru/eventa'

import { getKirieAndroidEventaContext } from './kirie-android-eventa'

export type KirieAndroidPermission = 'microphone' | 'notifications'

interface PermissionPayload {
  permission: KirieAndroidPermission
}

interface PermissionState {
  granted: boolean
}

const checkPermissionEvent = defineInvokeEventa<PermissionState, PermissionPayload>(
  'eventa:invoke:airi:android:permission:check',
)
const requestPermissionEvent = defineInvokeEventa<PermissionState, PermissionPayload>(
  'eventa:invoke:airi:android:permission:request',
)
const openPermissionSettingsEvent = defineInvokeEventa<void, PermissionPayload>(
  'eventa:invoke:airi:android:permission:open-settings',
)

export async function checkKirieAndroidPermission(permission: KirieAndroidPermission) {
  return await defineInvoke(getKirieAndroidEventaContext(), checkPermissionEvent)({ permission })
}

export async function requestKirieAndroidPermission(permission: KirieAndroidPermission) {
  return await defineInvoke(getKirieAndroidEventaContext(), requestPermissionEvent)({ permission })
}

export async function openKirieAndroidPermissionSettings(permission: KirieAndroidPermission) {
  await defineInvoke(getKirieAndroidEventaContext(), openPermissionSettingsEvent)({ permission })
}
