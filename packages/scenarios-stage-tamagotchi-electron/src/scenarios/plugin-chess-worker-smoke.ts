import type { ScenarioContext } from '@proj-airi/vishot-runner-electron'

import { defineScenario } from '@proj-airi/vishot-runner-electron'

type ElectronApplication = ScenarioContext['electronApp']
type Page = Parameters<ScenarioContext['capture']>[1]
type Frame = NonNullable<ReturnType<Page['frame']>>

const pluginName = 'airi-plugin-game-chess'
const pluginModuleId = 'chess-like-main'
const chessExtensionUiProps = JSON.stringify({ moduleId: pluginModuleId }, null, 2)
const whitespacePattern = /\s+/g
const stockfishJsPattern = /stockfish-18-lite-single-[\w-]+\.js/
const stockfishWasmPattern = /stockfish-18-lite-single-[\w-]+\.wasm/
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

function findChessFrame(widgetsPage: Page) {
  return widgetsPage.frames().find(candidate =>
    candidate.url().includes(pluginExtensionFramePath)
    || candidate.url().startsWith('airi-plugin://'),
  )
}

async function waitForChessFrameContent(widgetsPage: Page): Promise<Frame> {
  await widgetsPage.locator('iframe').first().waitFor({ state: 'visible', timeout: 20_000 })

  await waitForCondition(
    async () => {
      const frame = findChessFrame(widgetsPage)
      const text = await frame?.locator('body').textContent().catch(() => '') ?? ''
      return text.includes('Match Setup')
    },
    20_000,
    async () => {
      const iframeSrc = await widgetsPage.locator('iframe').first().getAttribute('src').catch(() => null)
      const frameUrls = widgetsPage.frames().map(frame => frame.url()).join('\n')
      return [
        'Timed out waiting for chess iframe content.',
        `iframe src: ${iframeSrc ?? '(none)'}`,
        `frame urls:\n${frameUrls}`,
      ].join('\n')
    },
  )

  const frame = findChessFrame(widgetsPage)
  if (!frame) {
    throw new Error('Chess iframe frame not found after content wait.')
  }

  return frame
}

async function runWorkerSmoke(frame: Frame) {
  return await frame.evaluate(async ({ stockfishJsPatternSource, stockfishWasmPatternSource }) => {
    const stockfishJsPattern = new RegExp(stockfishJsPatternSource)
    const stockfishWasmPattern = new RegExp(stockfishWasmPatternSource)
    const moduleScript = document.querySelector('script[type="module"][src]') as HTMLScriptElement | null
    if (!moduleScript?.src) {
      return { ok: false, reason: 'Missing module script in iframe document' } as const
    }

    const indexSource = await fetch(moduleScript.src).then(response => response.text())
    const jsMatch = indexSource.match(stockfishJsPattern)?.[0]
    const wasmMatch = indexSource.match(stockfishWasmPattern)?.[0]
    if (!jsMatch || !wasmMatch) {
      return {
        ok: false,
        reason: 'Failed to locate stockfish asset names in index chunk',
        moduleScriptSrc: moduleScript.src,
      } as const
    }

    const workerScriptUrl = new URL(jsMatch, moduleScript.src).toString()
    const wasmUrl = new URL(wasmMatch, moduleScript.src).toString()
    const workerUrl = `${workerScriptUrl}#${encodeURIComponent(wasmUrl)}`
    const workerFetch = await fetch(workerScriptUrl).then((response) => {
      return {
        ok: response.ok,
        status: response.status,
        contentType: response.headers.get('content-type') ?? '',
      }
    }).catch((error) => {
      return {
        ok: false,
        status: -1,
        contentType: String(error),
      }
    })
    const wasmFetch = await fetch(wasmUrl).then((response) => {
      return {
        ok: response.ok,
        status: response.status,
        contentType: response.headers.get('content-type') ?? '',
      }
    }).catch((error) => {
      return {
        ok: false,
        status: -1,
        contentType: String(error),
      }
    })

    let genericWorkerOk = false
    let genericWorkerError = ''
    try {
      const genericUrl = URL.createObjectURL(new Blob(['onmessage=()=>postMessage("pong")'], { type: 'text/javascript' }))
      const genericWorker = new Worker(genericUrl)
      const genericResult = await new Promise<'ok' | 'timeout' | 'error'>((resolve) => {
        const timer = setTimeout(resolve, 3_000, 'timeout')
        genericWorker.addEventListener('message', () => {
          clearTimeout(timer)
          resolve('ok')
        })
        genericWorker.addEventListener('error', () => {
          clearTimeout(timer)
          resolve('error')
        })
        genericWorker.postMessage('ping')
      })
      genericWorker.terminate()
      URL.revokeObjectURL(genericUrl)
      genericWorkerOk = genericResult === 'ok'
      if (genericResult !== 'ok') {
        genericWorkerError = `generic-worker-${genericResult}`
      }
    }
    catch (error) {
      genericWorkerError = String(error)
    }

    const logs: string[] = []
    let workerError = ''
    let ready = false
    let done = false

    const worker = new Worker(workerUrl)
    const timeout = setTimeout(() => {
      done = true
    }, 20_000)

    worker.addEventListener('message', (event) => {
      const text = typeof event.data === 'string' ? event.data : String(event.data)
      logs.push(text)
      if (text.includes('uciok')) {
        ready = true
        done = true
      }
    })
    worker.addEventListener('error', (event) => {
      workerError = event.message || 'worker error event'
      done = true
    })
    worker.addEventListener('messageerror', () => {
      workerError = 'worker messageerror event'
      done = true
    })

    const pingTimer = setInterval(() => {
      try {
        worker.postMessage('uci')
      }
      catch {
        // ignore
      }
    }, 700)

    const deadline = Date.now() + 20_000
    for (;;) {
      if (done || Date.now() >= deadline) {
        break
      }
      await new Promise(resolve => setTimeout(resolve, 120))
    }

    clearInterval(pingTimer)
    clearTimeout(timeout)
    worker.terminate()

    return {
      ok: ready,
      workerUrl,
      wasmUrl,
      workerFetch,
      wasmFetch,
      genericWorkerOk,
      genericWorkerError,
      workerError,
      logs,
    } as const
  }, {
    stockfishJsPatternSource: stockfishJsPattern.source,
    stockfishWasmPatternSource: stockfishWasmPattern.source,
  })
}

export default defineScenario({
  id: 'plugin-chess-worker-smoke',
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

    const widgetsPage = await waitForWidgetsWindowPage(electronApp, 45_000)
    const moduleFrame = await waitForChessFrameContent(widgetsPage)
    const smoke = await runWorkerSmoke(moduleFrame)
    await capture('plugin-chess-worker-smoke', widgetsPage, { fullPage: true })

    if (!smoke.ok) {
      throw new Error([
        'Stockfish worker smoke test failed.',
        `workerUrl: ${'workerUrl' in smoke ? smoke.workerUrl : '(missing)'}`,
        `wasmUrl: ${'wasmUrl' in smoke ? smoke.wasmUrl : '(missing)'}`,
        `workerFetch: ${'workerFetch' in smoke ? JSON.stringify(smoke.workerFetch) : '(missing)'}`,
        `wasmFetch: ${'wasmFetch' in smoke ? JSON.stringify(smoke.wasmFetch) : '(missing)'}`,
        `genericWorkerOk: ${'genericWorkerOk' in smoke ? String(smoke.genericWorkerOk) : '(missing)'}`,
        `genericWorkerError: ${'genericWorkerError' in smoke ? smoke.genericWorkerError || '(none)' : '(missing)'}`,
        `workerError: ${'workerError' in smoke ? smoke.workerError || '(none)' : '(missing)'}`,
        `logs: ${'logs' in smoke ? excerpt((smoke.logs ?? []).join(' | ')) : '(none)'}`,
        `reason: ${'reason' in smoke ? smoke.reason : '(none)'}`,
      ].join('\n'))
    }
  },
})
