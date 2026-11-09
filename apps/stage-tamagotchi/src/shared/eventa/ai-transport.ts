import type { TransportRequest, TransportResponse } from '@proj-airi/ai-transport'

import { defineEventa, defineInvokeEventa } from '@moeru/eventa'

export const aiTransportStart = defineInvokeEventa<TransportResponse, TransportRequest>('ai-transport:start')
export const aiTransportRead = defineInvokeEventa<Uint8Array | null, string>('ai-transport:read')
export const aiTransportCancel = defineInvokeEventa<void, string>('ai-transport:cancel')
export const aiTransportGetEnabled = defineInvokeEventa<boolean>('ai-transport:get-enabled')
export const aiTransportSetEnabled = defineInvokeEventa<boolean, boolean>('ai-transport:set-enabled')
export const aiTransportEnabledChanged = defineEventa<boolean>('ai-transport:enabled-changed')
