import { defineScenario } from '@proj-airi/vishot-runner-electron'

export default defineScenario({
  id: 'demo-dismiss-surfaces',
  async run({ dialogs, drawers, stageWindows }) {
    const mainWindow = await stageWindows.waitFor('main')

    await dialogs.dismiss(mainWindow.page)
    await drawers.swipeDown(mainWindow.page)
    await drawers.dismiss(mainWindow.page)
  },
})
