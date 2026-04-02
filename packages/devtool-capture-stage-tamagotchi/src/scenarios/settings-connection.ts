import { defineScenario } from '../runtime/define-scenario'

export default defineScenario({
  id: 'settings-connection',
  async run({ capture, stageWindows, controlsIsland, settingsWindow }) {
    const mainWindow = await stageWindows.waitFor('main')

    await controlsIsland.expand(mainWindow.page)
    const settings = await controlsIsland.openSettings(mainWindow.page)
    const page = await settingsWindow.goToConnection(settings.page)
    await page.waitForTimeout(1000)

    await page.getByText('WebSocket Server Address').waitFor({ state: 'visible' })
    await capture('connection-settings', page)
  },
})
