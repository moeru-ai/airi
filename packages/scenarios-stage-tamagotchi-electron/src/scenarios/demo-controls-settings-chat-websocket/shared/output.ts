import type { VishotArtifact } from '@proj-airi/vishot-runner-electron'

import type { PublishedArtifacts } from './types'

import path from 'node:path'

import { copyFile, mkdir, rm } from 'node:fs/promises'

import { errorMessageFrom } from '@moeru/std'

import { manualAssetFileNames } from '../manifest'
import { manualDocsAssetsDir, scenarioRawOutputDir } from './constants'

function extensionOf(filePath: string): string {
  return path.extname(filePath).toLowerCase()
}

export async function resetScenarioOutputDirectories() {
  await rm(scenarioRawOutputDir, { recursive: true, force: true })
  await mkdir(scenarioRawOutputDir, { recursive: true })
}

export async function removePublishedManualAssets() {
  await mkdir(manualDocsAssetsDir, { recursive: true })

  await Promise.all(
    manualAssetFileNames.map(fileName =>
      rm(path.join(manualDocsAssetsDir, fileName), { force: true }),
    ),
  )
}

export async function publishArtifactsToDocs(
  artifacts: VishotArtifact[],
  targetFileName: string,
): Promise<PublishedArtifacts> {
  if (artifacts.length === 0) {
    throw new Error(`Expected at least one artifact when publishing "${targetFileName}".`)
  }

  await mkdir(scenarioRawOutputDir, { recursive: true })
  await mkdir(manualDocsAssetsDir, { recursive: true })

  const rawArtifactPaths: string[] = []

  for (const artifact of artifacts) {
    const rawArtifactPath = path.join(scenarioRawOutputDir, path.basename(artifact.filePath))
    await copyFile(artifact.filePath, rawArtifactPath)
    rawArtifactPaths.push(rawArtifactPath)
  }

  const primaryArtifact = artifacts[0]
  if (extensionOf(primaryArtifact.filePath) !== extensionOf(targetFileName)) {
    throw new Error(
      [
        `Cannot publish "${targetFileName}" from "${path.basename(primaryArtifact.filePath)}".`,
        'Run the capture CLI with a matching format, for example `--format avif` for the manual docs flow.',
      ].join(' '),
    )
  }

  const docsAssetPath = path.join(manualDocsAssetsDir, targetFileName)
  await copyFile(primaryArtifact.filePath, docsAssetPath)
  await Promise.all(
    artifacts.map(artifact => rm(artifact.filePath, { force: true })),
  )

  return {
    docsAssetPath,
    rawArtifactPaths,
  }
}

export function formatStepFailure(sectionId: string, stepId: string, error: unknown): Error {
  const message = errorMessageFrom(error) ?? 'Unknown screenshot automation error'

  return new Error(`[${sectionId}/${stepId}] ${message}`, {
    cause: error instanceof Error ? error : undefined,
  })
}
