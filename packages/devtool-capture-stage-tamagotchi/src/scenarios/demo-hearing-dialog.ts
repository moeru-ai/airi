import { defineScenario } from '../runtime/define-scenario'

export default defineScenario({
  id: 'demo-hearing-dialog',
  async run({ capture, controlsIsland, stageWindows, drawers }) {
    const mainWindow = await stageWindows.waitFor('main')

    const page = await controlsIsland.openHearing(mainWindow.page)
    await page.waitForTimeout(1000)
    await capture('hearing-dialog-open', page)

    await drawers.swipeDown(page)
    await page.waitForTimeout(1000)
    await capture('hearing-dialog-down', page)
  },
})
