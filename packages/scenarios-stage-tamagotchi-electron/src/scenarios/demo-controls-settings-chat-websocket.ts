/* eslint-disable e18e/prefer-static-regex */
import { defineScenario } from '@proj-airi/vishot-runner-electron'

export default defineScenario({
  id: 'demo-controls-settings-chat-websocket',
  async run({ capture, controlsIsland, settingsWindow, stageWindows }) {
    const mainWindow = await stageWindows.waitFor('main')
    await mainWindow.page.waitForTimeout(2000)
    await capture('00-stage-tamagotchi', mainWindow.page)

    await controlsIsland.expand(mainWindow.page)
    await mainWindow.page.waitForTimeout(300)
    await capture('01-controls-island-expanded', mainWindow.page)

    const settingsWindowSnapshot = await controlsIsland.openSettings(mainWindow.page)
    await settingsWindowSnapshot.page.getByText(/connection|websocket|router/i).first().waitFor({ state: 'visible' })
    await settingsWindowSnapshot.page.waitForTimeout(300)
    await capture('02-settings-window', settingsWindowSnapshot.page)

    await mainWindow.page.bringToFront()
    await controlsIsland.expand(mainWindow.page)

    const websocketSettingsPage = await settingsWindow.goToConnection(settingsWindowSnapshot.page)
    await websocketSettingsPage.getByText('WebSocket Server Address').waitFor({ state: 'visible' })
    await websocketSettingsPage.waitForTimeout(750)
    await capture('04-websocket-settings', websocketSettingsPage)
  },
})
