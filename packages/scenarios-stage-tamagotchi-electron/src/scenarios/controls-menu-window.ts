import { defineStageTamagotchiScenario } from '../context'

/**
 * Walks the app menu of the Island, which opens in a window of its own beside the more button.
 *
 * Each step waits for the window that answers it, so a broken handoff between the windows stops the run:
 * - The more button opens the menu 8px beside the button, level with it.
 * - Escape, and a click beside the menu, close the menu and hide its window.
 * - A right-click on the character opens the same menu.
 * - Microphone settings open Hearing controls in the main window.
 * - Settings open the settings window.
 *
 * Capture runs set `APP_IGNORE_FOCUS=1`, so the menu window never takes focus. Check by hand that a click in another
 * app closes the menu.
 */
export default defineStageTamagotchiScenario({
  id: 'controls-menu-window',
  async run({ capture, controlsMenu, dialogs, stageWindows }) {
    const mainWindow = await stageWindows.waitFor('main')
    const menuPage = await controlsMenu.waitForPage()

    await controlsMenu.openFromMoreButton(mainWindow.page, menuPage)
    await controlsMenu.expectBesideMoreButton(mainWindow.page, menuPage)
    await capture('controls-menu-open', menuPage)
    await capture('controls-menu-main-window', mainWindow.page)

    await menuPage.keyboard.press('Escape')
    await controlsMenu.waitForWindow('hidden')

    await controlsMenu.openFromCharacter(mainWindow.page, menuPage)
    await controlsMenu.expectBesideMoreButton(mainWindow.page, menuPage)
    await controlsMenu.clickBeside(menuPage)
    await controlsMenu.waitForWindow('hidden')

    await controlsMenu.openFromMoreButton(mainWindow.page, menuPage)
    await menuPage.getByTestId('controls-island-hearing-controls').click()
    await mainWindow.page.getByTestId('hearing-config-dialog').waitFor({ state: 'visible' })
    await controlsMenu.waitForWindow('hidden')
    await capture('controls-menu-hearing', mainWindow.page)
    await dialogs.dismiss(mainWindow.page)

    await controlsMenu.openFromMoreButton(mainWindow.page, menuPage)
    await menuPage.getByTestId('controls-island-settings').click()
    await stageWindows.waitFor('settings')
    await controlsMenu.waitForWindow('hidden')
  },
})
