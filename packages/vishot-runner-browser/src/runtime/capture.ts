import type { Page } from 'playwright'

import type { BrowserCaptureRequest, VishotArtifact } from './types'

import path from 'node:path'

import { mkdir } from 'node:fs/promises'

import { chromium } from 'playwright'

import { applyArtifactTransformers, createImageArtifact } from './artifacts'
import { assertUniqueCaptureFilePaths, captureFilePath } from './files'
import { captureRootSelector } from './selectors'
import { startSceneViteServer } from './vite-server'

const defaultViewport = {
  width: 1600,
  height: 1200,
  deviceScaleFactor: 2,
} as const

function getScenarioCaptureRoots(page: Page): Promise<string[]> {
  return page.locator('[data-scenario-capture-root]').evaluateAll((elements) => {
    const rootNames = elements
      .map(element => element.getAttribute('data-scenario-capture-root') ?? '')
      .filter((name): name is string => name.length > 0)

    return [...new Set(rootNames)]
  })
}

async function waitForScenarioReady(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    return (window as typeof window & { __SCENARIO_CAPTURE_READY__?: boolean }).__SCENARIO_CAPTURE_READY__ === true
  })
}

async function captureRoot(page: Page, outputDir: string, rootName: string): Promise<VishotArtifact> {
  const filePath = captureFilePath(outputDir, rootName)
  const locator = page.locator(captureRootSelector(rootName))

  await locator.waitFor({ state: 'visible' })
  await locator.screenshot({
    animations: 'disabled',
    path: filePath,
  })

  return createImageArtifact({
    artifactName: rootName,
    filePath,
    stage: 'browser-final',
  })
}

async function resolveBaseUrl(request: BrowserCaptureRequest): Promise<{ baseUrl: string, closeServer?: () => Promise<void> }> {
  if (request.baseUrl) {
    return { baseUrl: request.baseUrl }
  }

  if (request.sceneAppRoot) {
    const server = await startSceneViteServer(request.sceneAppRoot)

    return {
      baseUrl: server.baseUrl,
      closeServer: server.close,
    }
  }

  throw new Error('Browser capture requires either "baseUrl" or "sceneAppRoot"')
}

export async function captureBrowserRoots(request: BrowserCaptureRequest): Promise<VishotArtifact[]> {
  const { baseUrl, closeServer } = await resolveBaseUrl(request)
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined

  try {
    browser = await chromium.launch()
    const context = await browser.newContext({
      viewport: {
        width: request.viewport?.width ?? defaultViewport.width,
        height: request.viewport?.height ?? defaultViewport.height,
      },
      deviceScaleFactor: request.viewport?.deviceScaleFactor ?? defaultViewport.deviceScaleFactor,
    })

    try {
      const page = await context.newPage()
      const targetUrl = new URL(request.routePath, baseUrl).href

      await page.goto(targetUrl)
      await waitForScenarioReady(page)
      await mkdir(path.resolve(request.outputDir), { recursive: true })

      const rootNames = request.rootNames?.length
        ? request.rootNames
        : await getScenarioCaptureRoots(page)

      assertUniqueCaptureFilePaths(rootNames)

      const artifacts: VishotArtifact[] = []

      for (const rootName of rootNames) {
        const artifact = await captureRoot(page, request.outputDir, rootName)
        artifacts.push(...await applyArtifactTransformers(artifact, request.imageTransformers))
      }

      return artifacts
    }
    finally {
      await context.close()
    }
  }
  finally {
    try {
      if (browser) {
        await browser.close()
      }
    }
    finally {
      if (closeServer) {
        await closeServer()
      }
    }
  }
}
