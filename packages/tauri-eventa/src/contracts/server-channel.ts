import type { ServerChannelQrPayload } from '@proj-airi/stage-shared/server-channel-qr'

import { defineInvokeEventa } from '@moeru/eventa'

export interface ElectronServerChannelConfig {
  tlsConfig?: unknown | null
  authToken: string
  hostname: string
}

export const electronGetServerChannelConfig = defineInvokeEventa<ElectronServerChannelConfig>(
  'eventa:invoke:electron:server-channel:get-config',
)

export const electronApplyServerChannelConfig = defineInvokeEventa<
  ElectronServerChannelConfig,
  Partial<ElectronServerChannelConfig>
>('eventa:invoke:electron:server-channel:apply-config')

export const electronGetServerChannelQrPayload = defineInvokeEventa<ServerChannelQrPayload>(
  'eventa:invoke:electron:server-channel:get-qr-payload',
)
