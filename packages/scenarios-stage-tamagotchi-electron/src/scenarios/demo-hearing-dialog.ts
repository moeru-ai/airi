import { defineStageTamagotchiScenario } from '../context'

export default defineStageTamagotchiScenario({
  id: 'demo-hearing-dialog',
  async run({ capture, controlsIsland, drawers, stageWindows }) {
    const mainWindow = await stageWindows.waitFor('main')

    const page = await controlsIsland.openHearing(mainWindow.page)
    await page.waitForTimeout(1000)
    await capture('hearing-dialog-open', page)

    await drawers.swipeDown(page)
    await page.waitForTimeout(1000)
    await capture('hearing-dialog-down', page)
  },
})
