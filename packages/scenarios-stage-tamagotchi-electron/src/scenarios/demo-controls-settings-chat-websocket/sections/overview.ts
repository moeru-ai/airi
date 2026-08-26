import type { ManualCaptureSection } from '../shared/types'

const websocketServerAddressPattern = /WebSocket Server Address|WebSocket 服务器地址/i

export const overviewSection: ManualCaptureSection = {
  id: 'overview',
  label: 'Interface overview',
  steps: [
    {
      docAssetFileName: 'manual-main-window.avif',
      id: 'main-window',
      kind: 'main-window',
      rawCaptureName: '00-stage-tamagotchi',
    },
    {
      docAssetFileName: 'manual-controls-island-expanded.avif',
      id: 'controls-island-expanded',
      kind: 'controls-island',
      rawCaptureName: '01-controls-island-expanded',
      waitMs: 250,
    },
    {
      docAssetFileName: 'manual-chat-window.avif',
      id: 'chat-window',
      kind: 'chat-window',
      rawCaptureName: '04-chat-window',
      readyPattern: /Chat/i,
      waitMs: 1000,
    },
    {
      docAssetFileName: 'manual-settings-window.avif',
      id: 'settings-window',
      kind: 'settings-overview',
      rawCaptureName: '02-settings-window',
      readyPattern: /connection|websocket|router/i,
      waitMs: 1000,
    },
    {
      docAssetFileName: 'manual-websocket-settings.avif',
      id: 'websocket-settings',
      kind: 'connection',
      rawCaptureName: '03-websocket-settings',
      readyPattern: websocketServerAddressPattern,
      waitMs: 1000,
    },
  ],
}
