import type { ScenarioContext } from '@proj-airi/vishot-runner-electron'

import { defineScenario } from '@proj-airi/vishot-runner-electron'

type ElectronApplication = ScenarioContext['electronApp']
type Page = Parameters<ScenarioContext['capture']>[1]
type Frame = ReturnType<Page['frame']>

const extensionId = 'airi-plugin-game-chess'
const pluginModuleId = 'chess-like-main'
const chessExtensionUiProps = JSON.stringify({ moduleId: pluginModuleId }, null, 2)
const spawnedWidgetPattern = /Spawned widget/i
const whitespacePattern = /\s+/g
const extensionRoutePathPrefix = `/_airi/extensions/${extensionId}/sessions/`

function inferRouteFromUrl(url: string): string {
  const hashIndex = url.indexOf('#')
  if (hashIndex === -1) {
    return ''
  }

  const hash = url.slice(hashIndex + 1)
  if (!hash) {
    return '/'
  }

  return hash.startsWith('/') ? hash : `/${hash}`
}

function normalizeRoutePath(route: string): string {
  if (!route) {
    return ''
  }

  const queryIndex = route.indexOf('?')
  if (queryIndex >= 0) {
    return route.slice(0, queryIndex)
  }

  return route
}

function excerpt(text: string, maxLength = 1800) {
  const normalized = text.replaceAll(whitespacePattern, ' ').trim()
  if (normalized.length <= maxLength) {
    return normalized
  }
  return `${normalized.slice(0, maxLength)}...`
}

async function getPageText(page: Page) {
  return await page.locator('body').textContent().catch(() => '') ?? ''
}

async function waitForCondition(
  check: () => Promise<boolean>,
  timeoutMs: number,
  failureMessage: () => Promise<string> | string,
) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await check()) {
      return
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }

  const message = typeof failureMessage === 'string'
    ? failureMessage
    : await failureMessage()
  throw new Error(message)
}

async function waitForWidgetsWindowPage(electronApp: ElectronApplication, timeoutMs = 30_000): Promise<Page> {
  const deadline = Date.now() + timeoutMs
  let lastSeenWindows = ''
  while (Date.now() < deadline) {
    for (const page of electronApp.windows()) {
      const title = await page.title().catch(() => '')
      const url = page.url()
      const route = inferRouteFromUrl(url)
      const routePath = normalizeRoutePath(route)
      if (title === 'Widgets' || routePath === '/widgets') {
        return page
      }
    }

    const snapshots = await Promise.all(
      electronApp.windows().map(async (page) => {
        const title = await page.title().catch(() => '')
        const url = page.url()
        const route = inferRouteFromUrl(url)
        return `${title || '(untitled)'} :: ${route || '(no-route)'} :: ${url}`
      }),
    )
    lastSeenWindows = snapshots.join('\n')
    await new Promise(resolve => setTimeout(resolve, 250))
  }

  throw new Error(`Timed out waiting for Widgets window.\nSeen windows:\n${lastSeenWindows}`)
}

async function ensurePluginEnabledAndLoaded(pluginHostPage: Page) {
  await pluginHostPage.getByPlaceholder('Filter discovered plugins...').fill(extensionId)
  await pluginHostPage.getByRole('button', { name: 'Refresh' }).click()

  await waitForCondition(
    async () => (await getPageText(pluginHostPage)).includes(extensionId),
    15_000,
    async () => {
      const text = await getPageText(pluginHostPage)
      return [
        `Plugin not discovered in Plugin Host: ${extensionId}`,
        `Page excerpt: ${excerpt(text)}`,
      ].join('\n')
    },
  )

  const pluginTitle = pluginHostPage.locator('div.font-semibold', { hasText: extensionId }).first()
  const pluginCard = pluginTitle.locator('xpath=ancestor::div[contains(@class, "rounded-xl")][1]')

  const hasDisabledChip = await pluginCard.getByText('disabled').first().isVisible().catch(() => false)
  if (hasDisabledChip) {
    await pluginCard.getByRole('button', { name: 'Enable' }).click()
    await pluginHostPage.getByRole('button', { name: 'Refresh' }).click()
  }

  await pluginHostPage.getByPlaceholder('Load discovered plugin by exact name...').fill(extensionId)
  await pluginHostPage.getByRole('button', { name: 'Load Plugin' }).click()
  await pluginHostPage.getByRole('button', { name: 'Refresh' }).click()

  await waitForCondition(
    async () => {
      const text = await getPageText(pluginHostPage)
      return text.includes('Loaded Plugins')
        && text.includes(extensionId)
        && text.includes('phase:ready')
    },
    20_000,
    async () => {
      const text = await getPageText(pluginHostPage)
      return [
        `Plugin did not reach ready phase. Expected extension=${extensionId}`,
        `Page excerpt: ${excerpt(text)}`,
      ].join('\n')
    },
  )
}

async function waitForSpawnedWidget(widgetsCallingPage: Page) {
  await waitForCondition(
    async () => {
      const text = await getPageText(widgetsCallingPage)
      return spawnedWidgetPattern.test(text)
    },
    15_000,
    async () => {
      const text = await getPageText(widgetsCallingPage)
      if (text.includes(`Plugin manifest not found: ${extensionId}`)) {
        return `Widget spawn failed: Plugin manifest not found: ${extensionId}\nPage excerpt: ${excerpt(text)}`
      }
      if (text.includes(`Plugin module "${pluginModuleId}" is not registered.`)) {
        return `Widget spawn failed: Plugin module "${pluginModuleId}" is not registered.\nPage excerpt: ${excerpt(text)}`
      }
      return `Widget spawn timed out. Page excerpt: ${excerpt(text)}`
    },
  )
}

async function getFrameText(frame: Frame | null | undefined) {
  if (!frame) {
    return ''
  }
  return await frame.locator('body').textContent().catch(() => '') ?? ''
}

async function waitForExtensionFrame(widgetsPage: Page) {
  await widgetsPage.locator('iframe').first().waitFor({ state: 'visible', timeout: 20_000 })

  await waitForCondition(
    async () => {
      const frame = widgetsPage.frames().find(candidate =>
        candidate.url().includes(extensionRoutePathPrefix),
      )
      return Boolean(frame)
    },
    20_000,
    async () => {
      const iframeSrc = await widgetsPage.locator('iframe').first().getAttribute('src').catch(() => null)
      const frameUrls = widgetsPage.frames().map(frame => frame.url()).join('\n')
      return [
        'Timed out waiting for extension iframe content.',
        `iframe src: ${iframeSrc ?? '(none)'}`,
        `frame urls:\n${frameUrls}`,
      ].join('\n')
    },
  )

  const frame = widgetsPage.frames().find(candidate =>
    candidate.url().includes(extensionRoutePathPrefix),
  )
  if (!frame) {
    throw new Error(`Extension iframe frame not found with path prefix ${extensionRoutePathPrefix}.`)
  }
  return frame
}

function assertExtensionAssetUrl(url: string, label: string) {
  if (!url) {
    throw new Error(`${label} is empty.`)
  }

  const parsed = new URL(url)
  if (parsed.protocol !== 'http:') {
    throw new Error(`${label} must use http protocol, got ${parsed.protocol} (${url}).`)
  }
  if (parsed.hostname !== '127.0.0.1') {
    throw new Error(`${label} must use 127.0.0.1, got ${parsed.hostname} (${url}).`)
  }
  if (!parsed.pathname.startsWith(extensionRoutePathPrefix) || !parsed.pathname.includes('/ui/')) {
    throw new Error(`${label} must use ${extensionRoutePathPrefix}:assetSessionId/ui/... path, got ${parsed.pathname} (${url}).`)
  }
  if (parsed.searchParams.has('t')) {
    throw new Error(`${label} must not contain legacy auth token query param "t", got ${url}.`)
  }
}

/**
 * Captures and verifies plugin widget static asset loading through local extension HTTP endpoint.
 *
 * Use when:
 * - Validating plugin-host + widget-calling devtools integration end-to-end
 * - Verifying iframe static assets are served from local auth-protected extension routes
 *
 * Expects:
 * - Chess plugin is discoverable by plugin host (`airi-plugin-game-chess`)
 * - Widget module `chess-like-main` is available after plugin load
 *
 * Returns:
 * - Visual captures for plugin host, widgets-calling, and widget iframe window
 * - Runtime assertions that iframe URL/frame URL are `http://127.0.0.1:<port>/_airi/extensions/.../sessions/.../ui/...`
 */
export default defineScenario({
  id: 'plugin-widget-static-assets-local-address',
  async run({ capture, controlsIsland, electronApp, settingsWindow, stageWindows }) {
    const mainWindow = await stageWindows.waitFor('main')
    await controlsIsland.waitForReady(mainWindow.page)

    await controlsIsland.expand(mainWindow.page)
    const settings = await controlsIsland.openSettings(mainWindow.page)

    const pluginHostPage = await settingsWindow.goToRoute(settings.page, '/devtools/plugin-host')
    await ensurePluginEnabledAndLoaded(pluginHostPage)

    const widgetsCallingPage = await settingsWindow.goToRoute(settings.page, '/devtools/widgets-calling')
    await widgetsCallingPage.getByRole('button', { name: 'Extension UI Preset' }).click()
    await widgetsCallingPage.getByLabel('Component Props (JSON)').fill(chessExtensionUiProps)
    await widgetsCallingPage.getByRole('button', { name: 'Spawn / Replace' }).click()
    await waitForSpawnedWidget(widgetsCallingPage)

    const widgetsPage = await waitForWidgetsWindowPage(electronApp, 45_000)
    await widgetsPage.locator('iframe').first().waitFor({ state: 'visible', timeout: 20_000 })

    const iframeSrc = await widgetsPage.locator('iframe').first().getAttribute('src')
    if (!iframeSrc) {
      throw new Error('Widget iframe src is missing.')
    }
    assertExtensionAssetUrl(iframeSrc, 'Widget iframe src')

    const extensionFrame = await waitForExtensionFrame(widgetsPage)
    assertExtensionAssetUrl(extensionFrame.url(), 'Widget iframe frame URL')
    const extensionFrameText = await getFrameText(extensionFrame)
    if (extensionFrameText.includes('Not Found') || extensionFrameText.includes('Unauthorized')) {
      throw new Error(`Extension iframe served an error document: ${excerpt(extensionFrameText)}`)
    }

    await capture('plugin-widget-static-assets-widget-window', widgetsPage, { fullPage: true })
  },
})
