import type { Page } from 'playwright'

const overlayDismissWaitMs = 200
const drawerSwipeDistancePx = 320
const drawerSwipeTopInsetPx = 24

async function hasVisibleDialog(page: Page): Promise<boolean> {
  return page.locator('[role="dialog"]').evaluateAll((elements) => {
    return elements.some((element) => {
      const htmlElement = element as HTMLElement
      const style = window.getComputedStyle(htmlElement)
      return style.display !== 'none' && style.visibility !== 'hidden' && htmlElement.getBoundingClientRect().height > 0
    })
  }).catch(() => false)
}

async function clickOverlayCorner(page: Page): Promise<void> {
  const viewport = page.viewportSize()
  const x = 16
  const y = Math.max(16, Math.min((viewport?.height ?? 48) - 16, 48))

  // NOTICE: AIRI dialogs and drawers render full-screen overlays, so a corner
  // click is a practical generic dismiss fallback when a dedicated close affordance
  // is not known ahead of time.
  await page.mouse.click(x, y)
}

async function getVisibleDialogBox(page: Page) {
  const dialogs = page.locator('[role="dialog"]')
  const count = await dialogs.count()

  for (let index = count - 1; index >= 0; index -= 1) {
    const dialog = dialogs.nth(index)
    if (await dialog.isVisible().catch(() => false)) {
      return dialog.boundingBox()
    }
  }

  return null
}

export async function dismissDialog(page: Page): Promise<void> {
  if (!await hasVisibleDialog(page)) {
    return
  }

  await page.keyboard.press('Escape').catch(() => undefined)
  await page.waitForTimeout(overlayDismissWaitMs)

  if (!await hasVisibleDialog(page)) {
    return
  }

  await clickOverlayCorner(page)
  await page.waitForTimeout(overlayDismissWaitMs)
}

export async function swipeDownDrawer(page: Page): Promise<void> {
  const dialogBox = await getVisibleDialogBox(page)
  if (!dialogBox) {
    return
  }

  const startX = dialogBox.x + (dialogBox.width / 2)
  const startY = dialogBox.y + Math.min(drawerSwipeTopInsetPx, Math.max(dialogBox.height / 8, 12))
  const endY = Math.min(dialogBox.y + dialogBox.height - 8, startY + Math.min(drawerSwipeDistancePx, dialogBox.height * 0.6))

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX, endY, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(overlayDismissWaitMs)
}

export async function dismissDrawer(page: Page): Promise<void> {
  if (!await hasVisibleDialog(page)) {
    return
  }

  await swipeDownDrawer(page)
  if (!await hasVisibleDialog(page)) {
    return
  }

  await page.keyboard.press('Escape').catch(() => undefined)
  await page.waitForTimeout(overlayDismissWaitMs)

  if (!await hasVisibleDialog(page)) {
    return
  }

  await clickOverlayCorner(page)
  await page.waitForTimeout(overlayDismissWaitMs)
}
