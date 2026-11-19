import type { ElectronApplication, Page } from 'playwright'

import { sleep } from '@moeru/std'

const controlsMenuRoute = '#/controls-menu'
const controlsMenuTimeoutMs = 15_000
const pollIntervalMs = 100
/** The gap between the menu and the more button, from the `side-offset` of the menu. */
const menuGapPx = 8
/** Rounding of window bounds and page boxes can move an edge by one pixel. */
const edgeTolerancePx = 1

interface ScreenBox {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Finds the page of the app menu window.
 *
 * The window loads with the main window and stays hidden until the menu opens. So this does not bring it to the front,
 * which would show it.
 */
export async function waitForControlsMenuPage(electronApp: ElectronApplication, timeout = 30_000): Promise<Page> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const page = electronApp.windows().find(window => window.url().includes(controlsMenuRoute))
    if (page)
      return page
    await sleep(pollIntervalMs)
  }
  throw new Error('Timed out waiting for the controls menu window')
}

async function isControlsMenuWindowVisible(electronApp: ElectronApplication): Promise<boolean> {
  return electronApp.evaluate(({ BrowserWindow }, route) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed() && window.webContents.getURL().includes(route))
        return window.isVisible()
    }
    return false
  }, controlsMenuRoute)
}

/** Waits until the menu window shows or hides. The window hides after the exit animation of the menu. */
export async function waitForControlsMenuWindow(electronApp: ElectronApplication, state: 'shown' | 'hidden'): Promise<void> {
  const deadline = Date.now() + controlsMenuTimeoutMs
  while (Date.now() < deadline) {
    if (await isControlsMenuWindowVisible(electronApp) === (state === 'shown'))
      return
    await sleep(pollIntervalMs)
  }
  throw new Error(`Timed out waiting for the controls menu window to be ${state}`)
}

/**
 * Opens the menu with the more button of the Island.
 *
 * The Island hides by the real cursor, which Playwright does not move. So the click is a DOM event on the button.
 */
export async function openControlsMenuFromMoreButton(electronApp: ElectronApplication, mainPage: Page, menuPage: Page): Promise<void> {
  await mainPage.getByTestId('controls-island-more').dispatchEvent('click')
  await menuPage.locator('[role="menu"]').first().waitFor({ state: 'visible', timeout: controlsMenuTimeoutMs })
  await waitForControlsMenuWindow(electronApp, 'shown')
}

/** Opens the menu with a right-click on the character, at the center of the stage. */
export async function openControlsMenuFromCharacter(electronApp: ElectronApplication, mainPage: Page, menuPage: Page): Promise<void> {
  // NOTICE:
  // Vishot bundles scenarios and names inner functions with a `__name` helper that the page does not have.
  // A script string reaches the page as it is.
  // Removal: when the scenario bundle keeps no `__name` helper in page functions.
  const dispatched = await mainPage.evaluate(`(() => {
    const x = innerWidth / 2
    const y = innerHeight / 2
    const target = document.elementFromPoint(x, y)
    if (!(target instanceof HTMLCanvasElement))
      return false
    target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: x, clientY: y }))
    return true
  })()`)
  if (!dispatched)
    throw new Error('The center of the main window is not the stage canvas')

  await menuPage.locator('[role="menu"]').first().waitFor({ state: 'visible', timeout: controlsMenuTimeoutMs })
  await waitForControlsMenuWindow(electronApp, 'shown')
}

async function readScreenBoxes(electronApp: ElectronApplication, mainPage: Page, menuPage: Page) {
  const button = await mainPage.getByTestId('controls-island-more').boundingBox()
  const menu = await menuPage.locator('[role="menu"]').first().boundingBox()
  const windows = await electronApp.evaluate(({ BrowserWindow }, route) => {
    let main: ScreenBox | undefined
    let menu: ScreenBox | undefined
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.isDestroyed())
        continue
      const url = window.webContents.getURL()
      if (url.includes('fullscreen-host=main-window'))
        main = window.getContentBounds()
      else if (url.includes(route))
        menu = window.getContentBounds()
    }
    return { main, menu }
  }, controlsMenuRoute)
  if (!button || !menu || !windows.main || !windows.menu)
    return undefined

  return {
    button: { ...button, x: windows.main.x + button.x, y: windows.main.y + button.y } satisfies ScreenBox,
    menu: { ...menu, x: windows.menu.x + menu.x, y: windows.menu.y + menu.y } satisfies ScreenBox,
  }
}

/**
 * Checks on the screen that the menu opens beside the more button: 8px to one side, and level with the button.
 *
 * The entry animation scales the menu at first, so the check waits for the final box.
 */
export async function expectControlsMenuBesideMoreButton(electronApp: ElectronApplication, mainPage: Page, menuPage: Page): Promise<void> {
  const deadline = Date.now() + controlsMenuTimeoutMs
  let last = 'no boxes'
  while (Date.now() < deadline) {
    const boxes = await readScreenBoxes(electronApp, mainPage, menuPage)
    if (boxes) {
      const { button, menu } = boxes
      const gapRight = menu.x - (button.x + button.width)
      const gapLeft = button.x - (menu.x + menu.width)
      const beside = Math.abs(gapRight - menuGapPx) <= edgeTolerancePx || Math.abs(gapLeft - menuGapPx) <= edgeTolerancePx
      const level = menu.y < button.y + button.height && button.y < menu.y + menu.height
      if (beside && level)
        return
      last = `button ${JSON.stringify(button)}, menu ${JSON.stringify(menu)}`
    }
    await sleep(pollIntervalMs)
  }
  throw new Error(`The controls menu did not open beside the more button: ${last}`)
}

/** Clicks the menu window at the corner of the work area farthest from the menu. The click closes the menu. */
export async function clickBesideControlsMenu(menuPage: Page): Promise<void> {
  const menu = await menuPage.locator('[role="menu"]').first().boundingBox()
  if (!menu)
    throw new Error('The controls menu is not open')

  // An Electron page has no fixed viewport, so the page reports its size.
  const viewport = await menuPage.evaluate('({ width: innerWidth, height: innerHeight })') as { width: number, height: number }

  const x = menu.x + menu.width / 2 < viewport.width / 2 ? viewport.width - 4 : 4
  const y = menu.y + menu.height / 2 < viewport.height / 2 ? viewport.height - 4 : 4
  await menuPage.mouse.click(x, y)
}
