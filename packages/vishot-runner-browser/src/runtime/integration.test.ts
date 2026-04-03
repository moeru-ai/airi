import path from 'node:path'

import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'

import { beforeAll, describe, expect, it, vi } from 'vitest'

interface FakeLocator {
  evaluateAll: <T>(callback: (elements: Array<{ getAttribute: (name: string) => string | null }>) => T) => Promise<T>
  waitFor: (opts: { state: 'visible' }) => Promise<void>
  screenshot: (opts: { animations: 'disabled', path: string }) => Promise<void>
}

interface FakePage {
  goto: (url: string) => Promise<void>
  waitForFunction: (predicate: () => boolean) => Promise<void>
  locator: (selector: string) => FakeLocator
}

function createFixturePage(html: string): FakePage {
  const readyState = {
    ready: false,
  }

  function getRootNames(): string[] {
    return Array.from(html.matchAll(/data-scenario-capture-root="([^"]+)"/g), match => match[1])
  }

  function hasRoot(selector: string): boolean {
    const match = selector.match(/^\[data-scenario-capture-root="([^"]+)"\]$/)

    if (!match) {
      return false
    }

    return getRootNames().includes(match[1])
  }

  return {
    async goto(url: string) {
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`Failed to load scene fixture: ${response.status} ${response.statusText}`)
      }

      html = await response.text()
      readyState.ready = /__SCENARIO_CAPTURE_READY__\s*=\s*true/.test(html)
    },
    async waitForFunction(predicate: () => boolean) {
      const startedAt = Date.now()

      while (Date.now() - startedAt <= 5000) {
        const previousWindow = globalThis.window

        Object.defineProperty(globalThis, 'window', {
          configurable: true,
          value: {
            __SCENARIO_CAPTURE_READY__: readyState.ready,
          },
        })

        try {
          if (predicate()) {
            return
          }
        }
        finally {
          if (previousWindow === undefined) {
            Reflect.deleteProperty(globalThis, 'window')
          }
          else {
            Object.defineProperty(globalThis, 'window', {
              configurable: true,
              value: previousWindow,
            })
          }
        }

        if (Date.now() - startedAt > 5000) {
          throw new Error('Timed out waiting for scene readiness')
        }

        await new Promise(resolve => setTimeout(resolve, 10))
      }

      throw new Error('Timed out waiting for scene readiness')
    },
    locator(selector: string): FakeLocator {
      return {
        async evaluateAll<T>(callback: (elements: Array<{ getAttribute: (name: string) => string | null }>) => T) {
          const elements = getRootNames().map(name => ({
            getAttribute(nameToGet: string) {
              return nameToGet === 'data-scenario-capture-root' ? name : null
            },
          }))

          return callback(elements)
        },
        async waitFor(opts: { state: 'visible' }) {
          if (opts.state !== 'visible' || !hasRoot(selector)) {
            throw new Error(`Selector not visible: ${selector}`)
          }
        },
        async screenshot(opts: { animations: 'disabled', path: string }) {
          await writeFile(opts.path, `fake screenshot for ${selector}\n`)
        },
      }
    },
  }
}

let captureBrowserRoots: typeof import('./capture').captureBrowserRoots

vi.mock('playwright', () => {
  return {
    chromium: {
      launch: vi.fn(async () => {
        let page: FakePage | undefined

        return {
          newContext: async () => ({
            newPage: async () => {
              page = createFixturePage('')
              return page
            },
            close: async () => {},
          }),
          close: async () => {},
        }
      }),
    },
  }
})

beforeAll(async () => {
  ;({ captureBrowserRoots } = await import('./capture'))
})

async function createViteSceneFixture(): Promise<string> {
  const rootDir = await mkdtemp(path.join(process.cwd(), '.tmp-scene-'))

  await mkdir(path.join(rootDir, 'artifacts'), { recursive: true })

  await writeFile(
    path.join(rootDir, 'index.html'),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Scene fixture</title>
  </head>
  <body>
    <script>
      window.__SCENARIO_CAPTURE_READY__ = true
    </script>
    <main style="display: grid; gap: 24px; padding: 24px; font-family: sans-serif;">
      <section data-scenario-capture-root="intro-chat-window" style="width: 480px; min-height: 160px; padding: 24px; border: 2px solid #334155; border-radius: 20px; background: #0f172a; color: white;">
        <h1 style="margin: 0 0 12px;">Chat window</h1>
        <p style="margin: 0;">Capture root fixture.</p>
      </section>
      <section data-scenario-capture-root="intro-websocket-settings" style="width: 480px; min-height: 160px; padding: 24px; border: 2px solid #334155; border-radius: 20px; background: #111827; color: white;">
        <h1 style="margin: 0 0 12px;">WebSocket settings</h1>
        <p style="margin: 0;">Capture root fixture.</p>
      </section>
    </main>
  </body>
</html>
`,
  )

  await writeFile(
    path.join(rootDir, 'vite.config.ts'),
    `import { defineConfig } from 'vite'

export default defineConfig({
  publicDir: 'artifacts',
})
`,
  )

  return rootDir
}

describe('captureBrowserRoots', () => {
  it('captures all roots from a vite-served scene app', async () => {
    const sceneAppRoot = await createViteSceneFixture()
    const outputDir = path.join(sceneAppRoot, 'artifacts', 'final-test')

    const artifacts = await captureBrowserRoots({
      sceneAppRoot,
      routePath: '/',
      outputDir,
    })

    expect(artifacts.map(item => item.artifactName)).toEqual([
      'intro-chat-window',
      'intro-websocket-settings',
    ])
    expect(artifacts.every(item => item.filePath.startsWith(outputDir))).toBe(true)
  }, 120000)
})
