import type { ScenarioContext } from '@proj-airi/vishot-runner-electron'

import { defineScenario } from '@proj-airi/vishot-runner-electron'

type ElectronApplication = ScenarioContext['electronApp']
type Page = Parameters<ScenarioContext['capture']>[1]
type Frame = ReturnType<Page['frame']>

const pluginName = 'airi-plugin-game-chess'
const pluginModuleId = 'chess-like-main'
const chessExtensionUiProps = JSON.stringify({ moduleId: pluginModuleId }, null, 2)
const spawnedWidgetPattern = /Spawned widget/i
const whitespacePattern = /\s+/g
const pluginExtensionFramePath = `/_airi/extensions/${pluginName}/sessions/`

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

async function waitForWidgetsWindowPage(electronApp: ElectronApplication, timeoutMs = 30_000): Promise<Page> {
  const deadline = Date.now() + timeoutMs
  let lastSeenWindows = ''
  while (Date.now() < deadline) {
    for (const page of electronApp.windows()) {
      const title = await page.title().catch(() => '')
      const url = page.url()
      const route = inferRouteFromUrl(url)
      const routePath = normalizeRoutePath(route)
      // NOTICE: `/settings/devtools/widgets-calling` also contains `"/widgets"`,
      // so this must match the exact widgets route/title to avoid selecting
      // the devtools settings page by mistake.
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

async function getPageText(page: Page) {
  return await page.locator('body').textContent().catch(() => '') ?? ''
}

function excerpt(text: string, maxLength = 1800) {
  const normalized = text.replaceAll(whitespacePattern, ' ').trim()
  if (normalized.length <= maxLength) {
    return normalized
  }
  return `${normalized.slice(0, maxLength)}...`
}

function normalizeWhitespace(text: string) {
  return text.replaceAll(whitespacePattern, ' ').trim()
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

async function waitForPluginReady(pluginHostPage: Page) {
  await pluginHostPage.getByPlaceholder('Filter discovered plugins...').fill(pluginName)
  await pluginHostPage.getByRole('button', { name: 'Refresh' }).click()

  await waitForCondition(
    async () => (await getPageText(pluginHostPage)).includes(pluginName),
    15_000,
    async () => {
      const text = await getPageText(pluginHostPage)
      return [
        `Plugin not discovered in Plugin Host: ${pluginName}`,
        `Page excerpt: ${excerpt(text)}`,
      ].join('\n')
    },
  )

  await pluginHostPage.getByPlaceholder('Load discovered plugin by exact name...').fill(pluginName)
  await pluginHostPage.getByRole('button', { name: 'Load Plugin' }).click()
  await pluginHostPage.getByRole('button', { name: 'Refresh' }).click()

  await waitForCondition(
    async () => {
      const text = await getPageText(pluginHostPage)
      return text.includes('Loaded Plugins')
        && text.includes(pluginName)
        && text.includes('phase:ready')
    },
    20_000,
    async () => {
      const text = await getPageText(pluginHostPage)
      return [
        `Plugin did not reach ready phase. Expected plugin=${pluginName}`,
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
      if (text.includes(`Plugin manifest not found: ${pluginName}`)) {
        return `Widget spawn failed: Plugin manifest not found: ${pluginName}\nPage excerpt: ${excerpt(text)}`
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

async function waitForChessFrameContent(widgetsPage: Page) {
  await widgetsPage.locator('iframe').first().waitFor({ state: 'visible', timeout: 20_000 })

  await waitForCondition(
    async () => {
      const frame = widgetsPage.frames().find(candidate =>
        candidate.url().includes(pluginExtensionFramePath)
        || candidate.url().startsWith('airi-plugin://'),
      )
      const text = await getFrameText(frame)
      if (text.includes('Not Found')) {
        throw new Error(`Plugin iframe returned Not Found. frameUrl=${frame?.url() ?? 'unknown'} text=${excerpt(text)}`)
      }
      return text.includes('Match Setup')
    },
    20_000,
    async () => {
      const iframeSrc = await widgetsPage.locator('iframe').first().getAttribute('src').catch(() => null)
      const frameUrls = widgetsPage.frames().map(frame => frame.url()).join('\n')
      const candidateFrame = widgetsPage.frames().find(frame =>
        frame.url().includes(pluginExtensionFramePath)
        || frame.url().startsWith('airi-plugin://'),
      )
      const frameText = await getFrameText(candidateFrame)
      return [
        'Timed out waiting for chess iframe content.',
        `iframe src: ${iframeSrc ?? '(none)'}`,
        `frame urls:\n${frameUrls}`,
        `frame text excerpt: ${excerpt(frameText)}`,
      ].join('\n')
    },
  )
}

export default defineScenario({
  id: 'plugin-chess-widget-flow',
  async run({ capture, controlsIsland, electronApp, settingsWindow, stageWindows }) {
    const mainWindow = await stageWindows.waitFor('main')
    await controlsIsland.waitForReady(mainWindow.page)

    await controlsIsland.expand(mainWindow.page)
    const settings = await controlsIsland.openSettings(mainWindow.page)

    const pluginHostPage = await settingsWindow.goToRoute(settings.page, '/devtools/plugin-host')
    await waitForPluginReady(pluginHostPage)

    const widgetsCallingPage = await settingsWindow.goToRoute(settings.page, '/devtools/widgets-calling')
    await widgetsCallingPage.getByRole('button', { name: 'Extension UI Preset' }).click()
    await widgetsCallingPage.getByLabel('Component Props (JSON)').fill(chessExtensionUiProps)
    await widgetsCallingPage.getByRole('button', { name: 'Spawn / Replace' }).click()
    await waitForSpawnedWidget(widgetsCallingPage)
    await capture('plugin-chess-widget-settings-flow', widgetsCallingPage)

    const widgetsPage = await waitForWidgetsWindowPage(electronApp, 45_000)
    await capture('plugin-chess-widget-window-before-iframe', widgetsPage, { fullPage: true })
    await waitForChessFrameContent(widgetsPage)
    await capture('plugin-chess-widget-window-setup', widgetsPage, { fullPage: true })
    const moduleFrame = widgetsPage.frameLocator('iframe')

    const gridMetrics = await moduleFrame.locator('button[title="a1"]').evaluate((node) => {
      const rect = node.getBoundingClientRect()
      return {
        width: rect.width,
        height: rect.height,
        delta: Math.abs(rect.width - rect.height),
      }
    })
    if (gridMetrics.delta > 1) {
      throw new Error(
        `Chess grid square is not square enough (a1): width=${gridMetrics.width.toFixed(2)} height=${gridMetrics.height.toFixed(2)} delta=${gridMetrics.delta.toFixed(2)}`,
      )
    }

    // Normalize mode for deterministic scenario playback.
    await moduleFrame.getByRole('radio', { name: 'Vs AIRI' }).click().catch(() => undefined)
    await moduleFrame.getByRole('button', { name: 'Start Game' }).click()

    // Verify gameplay is interactive and AI responds.
    await moduleFrame.getByTitle('e2').click()
    await moduleFrame.getByTitle('e4').click()
    await widgetsPage.waitForTimeout(1800)

    const afterMoveText = normalizeWhitespace(await moduleFrame.locator('body').textContent().catch(() => '') ?? '')
    if (afterMoveText.includes('AI Engine Minimax fallback') || afterMoveText.includes('Minimax fallback')) {
      throw new Error(`AIRI engine fell back to minimax during scenario. Frame text excerpt: ${excerpt(afterMoveText)}`)
    }

    await widgetsPage.waitForTimeout(500)
    await capture('plugin-chess-widget-window', widgetsPage, { fullPage: true })
  },
})
