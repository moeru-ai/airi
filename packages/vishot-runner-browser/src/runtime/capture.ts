import type { Page } from 'playwright'

import type { BrowserCaptureRequest, VishotArtifact } from './types'

import path from 'node:path'

import { mkdir, rm } from 'node:fs/promises'

import { chromium } from 'playwright'

import { applyArtifactTransformers, createImageArtifact } from './artifacts'
import {
  assertArtifactFilesExist,
  assertUniqueArtifactFilePaths,
  assertUniqueCaptureFilePaths,
  captureFilePath,
} from './files'
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

async function waitForPostReadySettle(page: Page, settleMs: number | undefined): Promise<void> {
  if (!settleMs || settleMs <= 0) {
    return
  }

  await page.waitForTimeout(settleMs)
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

function assertBrowserImageArtifact(artifact: VishotArtifact): void {
  if (artifact.kind !== 'image' || artifact.stage !== 'browser-final') {
    throw new Error(
      `Browser image transformers must return image artifacts with stage "browser-final". Received kind="${artifact.kind}" stage="${artifact.stage}" for artifact "${artifact.artifactName}".`,
    )
  }
}

async function applyBrowserImageTransformers(
  artifact: VishotArtifact,
  transformers: BrowserCaptureRequest['imageTransformers'],
): Promise<{
  artifacts: VishotArtifact[]
  shouldRemoveSourceFile: boolean
  sourceFilePath: string
}> {
  const sourceFilePath = artifact.filePath
  let currentArtifacts: VishotArtifact[] = [artifact]

  for (const transformer of transformers ?? []) {
    const nextArtifacts: VishotArtifact[] = []

    for (const currentArtifact of currentArtifacts) {
      const transformedArtifacts = await applyArtifactTransformers(currentArtifact, [transformer])

      for (const transformedArtifact of transformedArtifacts) {
        assertBrowserImageArtifact(transformedArtifact)
        nextArtifacts.push(transformedArtifact)
      }
    }

    assertUniqueArtifactFilePaths(nextArtifacts)
    await assertArtifactFilesExist(nextArtifacts)
    currentArtifacts = nextArtifacts
  }

  assertUniqueArtifactFilePaths(currentArtifacts)
  await assertArtifactFilesExist(currentArtifacts)

  return {
    artifacts: currentArtifacts,
    shouldRemoveSourceFile: currentArtifacts.length > 0 && currentArtifacts.every(artifact => artifact.filePath !== sourceFilePath),
    sourceFilePath,
  }
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
      await waitForPostReadySettle(page, request.settleMs)
      await mkdir(path.resolve(request.outputDir), { recursive: true })

      const rootNames = request.rootNames?.length
        ? request.rootNames
        : await getScenarioCaptureRoots(page)

      assertUniqueCaptureFilePaths(rootNames)

      const artifacts: VishotArtifact[] = []
      const cleanupTargets: Array<{
        shouldRemoveSourceFile: boolean
        sourceFilePath: string
      }> = []

      for (const rootName of rootNames) {
        const artifact = await captureRoot(page, request.outputDir, rootName)
        const transformed = await applyBrowserImageTransformers(artifact, request.imageTransformers)
        artifacts.push(...transformed.artifacts)
        cleanupTargets.push(transformed)
      }

      assertUniqueArtifactFilePaths(artifacts)

      for (const cleanupTarget of cleanupTargets) {
        if (cleanupTarget.shouldRemoveSourceFile) {
          await rm(cleanupTarget.sourceFilePath, { force: true })
        }
      }

      await context.close()

      return artifacts
    }
    finally {
      await context.close().catch(() => {})
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
