/* eslint-disable e18e/prefer-static-regex */
import { sleep } from '@moeru/std'
import { defineScenario } from '@proj-airi/vishot-runner-electron'

const airiCardPattern = /sort|排序|upload|上传/i
const providersPattern = /Chat|Speech|Transcription/i
// NOTICE: Must stay unique to /settings/data. The prior alternates `chat` / `聊天`
// also matched the providers page (step 06), which renders a `Chat` / `聊天` provider
// category immediately before this step — so the readiness check could pass on stale
// providers DOM and silently produce a mislabeled screenshot. `打开` was also too
// generic (appears on multiple pages as button labels). `Open app data folder` is
// the desktop-folder section title and is literal English across every locale file.
const dataPattern = /Open app data folder/i
const systemGeneralPattern = /theme|主题|language|语言/i
const systemColorSchemePattern = /RGB|Primary Color|主题颜色|500\/50/i
const modelsPattern = /select model|confirm|缩放与位置|Zoom & Position/i
const modulesPattern = /Consciousness|意识|Speech|发声|Hearing|听觉/i
const hearingPattern = /Audio Input Device|音频输入设备|start monitoring|Start Monitoring|Transcription Result/i
const developerPattern = /Open DevTools|打开|Markdown|Lag|Vision Capture|Screen Capture/i
// NOTICE: Anchor on the consciousness page's always-rendered section description
// (consciousness.vue renders this unconditionally regardless of provider/model state
// or user locale). Previous alternates like `提供商` / `No Providers Configured` did
// not match zh-Hans (which renders `服务来源` / `没有配置服务来源`), and `当前模型` /
// `Current model` only appear when a model is already selected — so fresh environments
// with no providers configured would hang on readiness.
//
// Caveat: vision.vue reuses the same `provider-model-selection.description` i18n key,
// so this pattern also matches on /settings/modules/vision. That is safe here because
// consciousness (step 14) is reached from developer (step 13), which does not render
// either phrase — no stale-DOM collision is possible at this step. If the step order
// ever changes, pick a token unique to consciousness.vue instead.
const consciousnessPattern = /Select the suitable LLM|为意识选择合适/i
const speechPattern = /Hello, my name is AI Assistant|Test voice|Voice|声音|Speech|选择语音合成服务来源/i
const visionPattern = /Capture interval|context|ollama|提供商|Current model|Chat|Vision capture cadence/i
const useWindowMousePattern = /useWindowMouse|\d+,\s*\d+/i
const displaysPattern = /useElectronAllDisplays|@\s*\d+°|Visualize connected displays and cursor position/i
const widgetsCallingPattern = /Widget id is required|Small \(s\)|Spawned widget|Component name/i
const contextFlowPattern = /Active contexts|Prompt projection|Runtime|Context Flow|Filters/i
const relativeMousePattern = /windowX = screenX - windowBounds\.x|Green dot shows current window-relative cursor position|Relative Mouse/i
const beatSyncPattern = /Beat sync driver|Hit beat|Punchy V|Beat Sync Visualizer/i
const websocketInspectorPattern = /Incoming|Outgoing|Filter payload|No messages found|WebSocket Inspector/i
const pluginHostPattern = /Discovered|Enabled|Loaded|Capabilities|Plugin Host Debug/i
const screenCapturePattern = /Applications|Displays|Refetch|Share Window|Share Screen|屏幕捕获|Open system preferences|打开系统偏好设置/i
// NOTICE: Must stay unique to /devtools/vision. Step 25 captures /devtools/screen-capture
// immediately before this, and both pages render `Applications` / `Displays` tab labels, so
// matching against those generics lets the readiness check pass against the stale
// screen-capture DOM and silently produce a mislabeled screenshot. Only use text that does
// not appear on screen-capture.vue.
const visionCapturePattern = /Capture interval|No vision output yet|vision capture/i
const websocketServerAddressPattern = /WebSocket Server Address|WebSocket 服务器地址/i

function normalizeHashPath(hash: string): string {
  const withoutHash = hash.startsWith('#')
    ? hash.slice(1)
    : hash

  return withoutHash || '/'
}

function isTimeoutLikeError(error: unknown): boolean {
  return error instanceof Error && error.name === 'TimeoutError'
}

export default defineScenario({
  id: 'demo-controls-settings-chat-websocket',
  async run({ capture, controlsIsland, settingsWindow, stageWindows }) {
    async function ensureControlsIslandExpanded() {
      const chatButton = mainWindow.page
        .locator('button')
        .filter({
          has: mainWindow.page.locator('[i-solar\\:chat-line-line-duotone]'),
        })
        .first()

      const chatButtonVisible = await chatButton.isVisible().catch(() => false)
      if (!chatButtonVisible) {
        await controlsIsland.expand(mainWindow.page)
        await sleep(250)
      }
    }

    async function captureSettingsRoute(name: string, routePath: string, readyPattern: RegExp, waitMs = 250) {
      await settingsWindow.goToRoute(settingsWindowSnapshot.page, routePath)
      try {
        await settingsWindowSnapshot.page.getByText(readyPattern).first().waitFor({ state: 'visible', timeout: 15_000 })
      }
      catch (error) {
        if (!isTimeoutLikeError(error)) {
          throw error
        }

        const currentHashPath = normalizeHashPath(new URL(settingsWindowSnapshot.page.url()).hash)
        if (currentHashPath !== routePath) {
          throw error
        }

        // NOTICE: Some settings/devtools pages animate in or hydrate content asynchronously.
        // Give known-slow pages one final bounded grace period, but still fail if the target route never becomes ready.
        await sleep(1250)
        await settingsWindowSnapshot.page.getByText(readyPattern).first().waitFor({ state: 'visible', timeout: 5_000 })
      }
      await sleep(waitMs)
      await capture(name, settingsWindowSnapshot.page)
    }

    const mainWindow = await stageWindows.waitFor('main')
    await controlsIsland.waitForReady(mainWindow.page)

    await capture('00-stage-tamagotchi', mainWindow.page)
    await sleep(500)

    await controlsIsland.expand(mainWindow.page)
    await sleep(250)
    await capture('01-controls-island-expanded', mainWindow.page)
    await sleep(250)

    await ensureControlsIslandExpanded()
    const chatWindowSnapshot = await controlsIsland.openChat(mainWindow.page)
    await chatWindowSnapshot.page.getByText(/Chat/i).first().waitFor({ state: 'visible' })
    await sleep(1000)
    await capture('04-chat-window', chatWindowSnapshot.page)
    await sleep(250)

    await mainWindow.page.bringToFront()
    await controlsIsland.waitForReady(mainWindow.page)
    await ensureControlsIslandExpanded()

    const settingsWindowSnapshot = await controlsIsland.openSettings(mainWindow.page)
    await settingsWindowSnapshot.page.getByText(/connection|websocket|router/i).first().waitFor({ state: 'visible' })
    await sleep(1000)
    await capture('02-settings-window', settingsWindowSnapshot.page)

    await settingsWindow.goToRoute(settingsWindowSnapshot.page, '/settings/airi-card')
    await settingsWindowSnapshot.page.getByText(airiCardPattern).first().waitFor({ state: 'visible' })
    await sleep(1000)
    await capture('05-airi-card', settingsWindowSnapshot.page)

    await settingsWindow.goToRoute(settingsWindowSnapshot.page, '/settings/providers')
    await settingsWindowSnapshot.page.getByText(providersPattern).first().waitFor({ state: 'visible' })
    await sleep(1000)
    await capture('06-providers', settingsWindowSnapshot.page)

    await settingsWindow.goToRoute(settingsWindowSnapshot.page, '/settings/data')
    await settingsWindowSnapshot.page.getByText(dataPattern).first().waitFor({ state: 'visible' })
    await sleep(1000)
    await capture('07-data', settingsWindowSnapshot.page)

    await settingsWindow.goToRoute(settingsWindowSnapshot.page, '/settings/system/general')
    await settingsWindowSnapshot.page.getByText(systemGeneralPattern).first().waitFor({ state: 'visible' })
    await sleep(1000)
    await capture('08-system-general', settingsWindowSnapshot.page)

    await settingsWindow.goToRoute(settingsWindowSnapshot.page, '/settings/system/color-scheme')
    await settingsWindowSnapshot.page.getByText(systemColorSchemePattern).first().waitFor({ state: 'visible' })
    await sleep(1000)
    await capture('09-system-color-scheme', settingsWindowSnapshot.page)

    await settingsWindow.goToRoute(settingsWindowSnapshot.page, '/settings/models')
    await settingsWindowSnapshot.page.getByText(modelsPattern).first().waitFor({ state: 'visible' })
    await sleep(1000)
    await capture('10-models', settingsWindowSnapshot.page)

    await settingsWindow.goToRoute(settingsWindowSnapshot.page, '/settings/modules')
    await settingsWindowSnapshot.page.getByText(modulesPattern).first().waitFor({ state: 'visible' })
    await sleep(1000)
    await capture('11-modules', settingsWindowSnapshot.page)

    await settingsWindow.goToRoute(settingsWindowSnapshot.page, '/settings/modules/hearing')
    await settingsWindowSnapshot.page.getByText(hearingPattern).first().waitFor({ state: 'visible' })
    await sleep(1000)
    await capture('12-hearing', settingsWindowSnapshot.page)

    await settingsWindow.goToRoute(settingsWindowSnapshot.page, '/settings/system/developer')
    await settingsWindowSnapshot.page.getByText(developerPattern).first().waitFor({ state: 'visible' })
    await sleep(1000)
    await capture('13-system-developer', settingsWindowSnapshot.page)

    await captureSettingsRoute('14-consciousness', '/settings/modules/consciousness', consciousnessPattern)
    await captureSettingsRoute('15-speech', '/settings/modules/speech', speechPattern, 500)
    await captureSettingsRoute('16-vision', '/settings/modules/vision', visionPattern)
    await captureSettingsRoute('17-devtools-use-window-mouse', '/devtools/use-window-mouse', useWindowMousePattern)
    await captureSettingsRoute('18-devtools-displays', '/devtools/use-electron-all-displays', displaysPattern)
    await captureSettingsRoute('19-devtools-widgets-calling', '/devtools/widgets-calling', widgetsCallingPattern)
    await captureSettingsRoute('20-devtools-context-flow', '/devtools/context-flow', contextFlowPattern)
    await captureSettingsRoute('21-devtools-relative-mouse', '/devtools/use-electron-relative-mouse', relativeMousePattern)
    await captureSettingsRoute('22-devtools-beat-sync', '/devtools/beat-sync', beatSyncPattern)
    await captureSettingsRoute('23-devtools-websocket-inspector', '/devtools/websocket-inspector', websocketInspectorPattern)
    await captureSettingsRoute('24-devtools-plugin-host', '/devtools/plugin-host', pluginHostPattern)
    await captureSettingsRoute('25-devtools-screen-capture', '/devtools/screen-capture', screenCapturePattern, 500)
    await captureSettingsRoute('26-devtools-vision-capture', '/devtools/vision', visionCapturePattern, 500)

    await settingsWindowSnapshot.page.bringToFront()
    await sleep(500)

    const websocketSettingsPage = await settingsWindow.goToConnection(settingsWindowSnapshot.page)
    await websocketSettingsPage.getByText(websocketServerAddressPattern).waitFor({ state: 'visible' })
    await sleep(1000)
    await capture('03-websocket-settings', websocketSettingsPage)
  },
})
