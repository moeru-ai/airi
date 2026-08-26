import type { ManualCaptureSection } from '../shared/types'

const websocketServerAddressPattern = /WebSocket Server Address|WebSocket 服务器地址/i

export const overviewSection: ManualCaptureSection = {
  id: 'overview',
  label: 'Interface overview',
  steps: [
    {
      id: 'main-window',
      kind: 'main-window',
      rawCaptureName: '00-stage-tamagotchi',
      docAssetFileName: 'manual-main-window.avif',
    },
    {
      id: 'controls-island-expanded',
      kind: 'controls-island',
      rawCaptureName: '01-controls-island-expanded',
      docAssetFileName: 'manual-controls-island-expanded.avif',
      waitMs: 250,
    },
    {
      id: 'chat-window',
      kind: 'chat-window',
      rawCaptureName: '04-chat-window',
      docAssetFileName: 'manual-chat-window.avif',
      readyPattern: /Chat/i,
      waitMs: 1000,
    },
    {
      id: 'settings-window',
      kind: 'settings-overview',
      rawCaptureName: '02-settings-window',
      docAssetFileName: 'manual-settings-window.avif',
      readyPattern: /connection|websocket|router/i,
      waitMs: 1000,
    },
    {
      id: 'websocket-settings',
      kind: 'connection',
      rawCaptureName: '03-websocket-settings',
      docAssetFileName: 'manual-websocket-settings.avif',
      readyPattern: websocketServerAddressPattern,
      waitMs: 1000,
    },
  ],
}
