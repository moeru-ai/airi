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
      id: 'use-window-mouse',
      kind: 'settings-route',
      routePath: '/devtools/use-window-mouse',
      readyPattern: useWindowMousePattern,
      rawCaptureName: '17-devtools-use-window-mouse',
      docAssetFileName: 'manual-devtools-use-window-mouse.avif',
      waitMs: navHeaderSettleWaitMs,
    },
    {
      id: 'displays',
      kind: 'settings-route',
      routePath: '/devtools/use-electron-all-displays',
      readyPattern: displaysPattern,
      rawCaptureName: '18-devtools-displays',
      docAssetFileName: 'manual-devtools-displays.avif',
      waitMs: navHeaderSettleWaitMs,
    },
    {
      id: 'widgets-calling',
      kind: 'settings-route',
      routePath: '/devtools/widgets-calling',
      readyPattern: widgetsCallingPattern,
      rawCaptureName: '19-devtools-widgets-calling',
      docAssetFileName: 'manual-devtools-widgets-calling.avif',
      waitMs: navHeaderSettleWaitMs,
    },
    {
      id: 'context-flow',
      kind: 'settings-route',
      routePath: '/devtools/context-flow',
      readyPattern: contextFlowPattern,
      rawCaptureName: '20-devtools-context-flow',
      docAssetFileName: 'manual-devtools-context-flow.avif',
      waitMs: navHeaderSettleWaitMs,
    },
    {
      id: 'relative-mouse',
      kind: 'settings-route',
      routePath: '/devtools/use-electron-relative-mouse',
      readyPattern: relativeMousePattern,
      rawCaptureName: '21-devtools-relative-mouse',
      docAssetFileName: 'manual-devtools-relative-mouse.avif',
      waitMs: navHeaderSettleWaitMs,
    },
    {
      id: 'beat-sync',
      kind: 'settings-route',
      routePath: '/devtools/beat-sync',
      readyPattern: beatSyncPattern,
      rawCaptureName: '22-devtools-beat-sync',
      docAssetFileName: 'manual-devtools-beat-sync.avif',
      waitMs: navHeaderSettleWaitMs,
    },
    {
      id: 'websocket-inspector',
      kind: 'settings-route',
      routePath: '/devtools/websocket-inspector',
      readyPattern: websocketInspectorPattern,
      rawCaptureName: '23-devtools-websocket-inspector',
      docAssetFileName: 'manual-devtools-websocket-inspector.avif',
      waitMs: navHeaderSettleWaitMs,
    },
    {
      id: 'plugin-host',
      kind: 'settings-route',
      routePath: '/devtools/plugin-host',
      readyPattern: pluginHostPattern,
      rawCaptureName: '24-devtools-plugin-host',
      docAssetFileName: 'manual-devtools-plugin-host.avif',
      waitMs: navHeaderSettleWaitMs,
    },
    {
      id: 'screen-capture',
      kind: 'settings-route',
      routePath: '/devtools/screen-capture',
      readyPattern: screenCapturePattern,
      rawCaptureName: '25-devtools-screen-capture',
      docAssetFileName: 'manual-devtools-screen-capture.avif',
      waitMs: 500,
    },
    {
      id: 'vision-capture',
      kind: 'settings-route',
      routePath: '/devtools/vision',
      readyPattern: visionCapturePattern,
      rawCaptureName: '26-devtools-vision-capture',
      docAssetFileName: 'manual-devtools-vision-capture.avif',
      waitMs: navHeaderSettleWaitMs,
    },
  ],
}
