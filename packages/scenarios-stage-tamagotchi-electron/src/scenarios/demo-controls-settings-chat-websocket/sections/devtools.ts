import type { ManualCaptureSection } from '../shared/types'

const useWindowMousePattern = /useWindowMouse|\d+,\s*\d+/i
const displaysPattern = /useElectronAllDisplays|@\s*\d+°|Visualize connected displays and cursor position/i
const widgetsCallingPattern = /Widget id is required|Small \(s\)|Spawned widget|Component name/i
const contextFlowPattern = /Active contexts|Prompt projection|Runtime|Context Flow|Filters/i
const relativeMousePattern = /windowX = screenX - windowBounds\.x|Green dot shows current window-relative cursor position|Relative Mouse/i
const beatSyncPattern = /Beat sync driver|Hit beat|Punchy V|Beat Sync Visualizer/i
const websocketInspectorPattern = /Incoming|Outgoing|Filter payload|No messages found|WebSocket Inspector/i
const pluginHostPattern = /Discovered|Enabled|Loaded|Capabilities|Plugin Host Debug/i
const screenCapturePattern = /Applications|Displays|Refetch|Share Window|Share Screen|屏幕捕获|Open system preferences|打开系统偏好设置/i
// NOTICE: Must stay unique to /devtools/vision. The previous step captures
// /devtools/screen-capture and both pages render `Applications` / `Displays`,
// so matching against those generics can pass against stale screen-capture DOM
// and silently produce a mislabeled screenshot.
const visionCapturePattern = /Capture interval|No vision output yet|vision capture/i
const navHeaderSettleWaitMs = 1000

export const devtoolsSection: ManualCaptureSection = {
  id: 'devtools',
  label: 'Developer tools',
  steps: [
    {
      docAssetFileName: 'manual-devtools-use-window-mouse.avif',
      id: 'use-window-mouse',
      kind: 'settings-route',
      rawCaptureName: '17-devtools-use-window-mouse',
      readyPattern: useWindowMousePattern,
      routePath: '/devtools/use-window-mouse',
      waitMs: navHeaderSettleWaitMs,
    },
    {
      docAssetFileName: 'manual-devtools-displays.avif',
      id: 'displays',
      kind: 'settings-route',
      rawCaptureName: '18-devtools-displays',
      readyPattern: displaysPattern,
      routePath: '/devtools/use-electron-all-displays',
      waitMs: navHeaderSettleWaitMs,
    },
    {
      docAssetFileName: 'manual-devtools-widgets-calling.avif',
      id: 'widgets-calling',
      kind: 'settings-route',
      rawCaptureName: '19-devtools-widgets-calling',
      readyPattern: widgetsCallingPattern,
      routePath: '/devtools/widgets-calling',
      waitMs: navHeaderSettleWaitMs,
    },
    {
      docAssetFileName: 'manual-devtools-context-flow.avif',
      id: 'context-flow',
      kind: 'settings-route',
      rawCaptureName: '20-devtools-context-flow',
      readyPattern: contextFlowPattern,
      routePath: '/devtools/context-flow',
      waitMs: navHeaderSettleWaitMs,
    },
    {
      docAssetFileName: 'manual-devtools-relative-mouse.avif',
      id: 'relative-mouse',
      kind: 'settings-route',
      rawCaptureName: '21-devtools-relative-mouse',
      readyPattern: relativeMousePattern,
      routePath: '/devtools/use-electron-relative-mouse',
      waitMs: navHeaderSettleWaitMs,
    },
    {
      docAssetFileName: 'manual-devtools-beat-sync.avif',
      id: 'beat-sync',
      kind: 'settings-route',
      rawCaptureName: '22-devtools-beat-sync',
      readyPattern: beatSyncPattern,
      routePath: '/devtools/beat-sync',
      waitMs: navHeaderSettleWaitMs,
    },
    {
      docAssetFileName: 'manual-devtools-websocket-inspector.avif',
      id: 'websocket-inspector',
      kind: 'settings-route',
      rawCaptureName: '23-devtools-websocket-inspector',
      readyPattern: websocketInspectorPattern,
      routePath: '/devtools/websocket-inspector',
      waitMs: navHeaderSettleWaitMs,
    },
    {
      docAssetFileName: 'manual-devtools-plugin-host.avif',
      id: 'plugin-host',
      kind: 'settings-route',
      rawCaptureName: '24-devtools-plugin-host',
      readyPattern: pluginHostPattern,
      routePath: '/devtools/plugin-host',
      waitMs: navHeaderSettleWaitMs,
    },
    {
      docAssetFileName: 'manual-devtools-screen-capture.avif',
      id: 'screen-capture',
      kind: 'settings-route',
      rawCaptureName: '25-devtools-screen-capture',
      readyPattern: screenCapturePattern,
      routePath: '/devtools/screen-capture',
      waitMs: 500,
    },
    {
      docAssetFileName: 'manual-devtools-vision-capture.avif',
      id: 'vision-capture',
      kind: 'settings-route',
      rawCaptureName: '26-devtools-vision-capture',
      readyPattern: visionCapturePattern,
      routePath: '/devtools/vision',
      waitMs: navHeaderSettleWaitMs,
    },
  ],
}
