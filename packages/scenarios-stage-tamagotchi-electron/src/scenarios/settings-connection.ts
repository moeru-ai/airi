import { defineScenario } from '@proj-airi/vishot-runner-electron'

const websocketServerAddressPattern = /WebSocket Server Address|WebSocket 服务器地址/i

export default defineScenario({
  id: 'settings-connection',
  async run({ capture, stageWindows, controlsIsland, settingsWindow }) {
    const mainWindow = await stageWindows.waitFor('main')
    await controlsIsland.waitForReady(mainWindow.page)

    await controlsIsland.expand(mainWindow.page)
    const settings = await controlsIsland.openSettings(mainWindow.page)
    const page = await settingsWindow.goToConnection(settings.page)
    await page.waitForTimeout(1000)

    await page.getByText(websocketServerAddressPattern).waitFor({ state: 'visible' })
    await capture('connection-settings', page)
  },
})
