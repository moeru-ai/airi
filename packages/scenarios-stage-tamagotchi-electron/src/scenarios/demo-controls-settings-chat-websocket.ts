/* eslint-disable e18e/prefer-static-regex */
import { sleep } from '@moeru/std'
import { defineScenario } from '@proj-airi/vishot-runner-electron'

export default defineScenario({
  id: 'demo-controls-settings-chat-websocket',
  async run({ capture, controlsIsland, settingsWindow, stageWindows }) {
    const mainWindow = await stageWindows.waitFor('main')
    await capture('00-stage-tamagotchi', mainWindow.page)
    await sleep(500)

    await controlsIsland.expand(mainWindow.page)
    await sleep(1000)
    await capture('01-controls-island-expanded', mainWindow.page)

    const settingsWindowSnapshot = await controlsIsland.openSettings(mainWindow.page)
    await settingsWindowSnapshot.page.getByText(/connection|websocket|router/i).first().waitFor({ state: 'visible' })
    await sleep(1000)
    await capture('02-settings-window', settingsWindowSnapshot.page)

    await mainWindow.page.bringToFront()
    const websocketSettingsPage = await settingsWindow.goToConnection(settingsWindowSnapshot.page)
    await websocketSettingsPage.getByText('WebSocket Server Address').waitFor({ state: 'visible' })
    await sleep(1000)
    await capture('03-websocket-settings', websocketSettingsPage)
  },
})
