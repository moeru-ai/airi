/* eslint-disable e18e/prefer-static-regex */
import { defineScenario } from '../runtime/define-scenario'

export default defineScenario({
  id: 'demo-controls-settings-chat-websocket',
  async run({ capture, controlsIsland, settingsWindow, stageWindows }) {
    const mainWindow = await stageWindows.waitFor('main')

    await controlsIsland.expand(mainWindow.page)
    await mainWindow.page.waitForTimeout(300)

    await capture('00-controls-island-expanded', mainWindow.page)

    const settingsWindowSnapshot = await controlsIsland.openSettings(mainWindow.page)
    await settingsWindowSnapshot.page.getByText(/connection|websocket|router/i).first().waitFor({ state: 'visible' })
    await settingsWindowSnapshot.page.waitForTimeout(300)
    await capture('01-settings-window', settingsWindowSnapshot.page)

    await mainWindow.page.bringToFront()
    await controlsIsland.expand(mainWindow.page)
    const chatWindowSnapshot = await controlsIsland.openChat(mainWindow.page)
    await chatWindowSnapshot.page.waitForLoadState('domcontentloaded')
    await chatWindowSnapshot.page.waitForTimeout(300)
    await capture('02-chat-window', chatWindowSnapshot.page)

    const websocketSettingsPage = await settingsWindow.goToConnection(settingsWindowSnapshot.page)
    await websocketSettingsPage.getByText('WebSocket Server Address').waitFor({ state: 'visible' })
    await websocketSettingsPage.waitForTimeout(300)
    await capture('03-websocket-settings', websocketSettingsPage)
  },
})
