import type { VishotArtifact } from './types'

import path from 'node:path'

import { access } from 'node:fs/promises'

const nonFilenameCharactersPattern = /[^a-z0-9-_]+/g
const edgeDashPattern = /^-+|-+$/g

export function sanitizeOutputName(name: string): string {
  const sanitized = name
    .trim()
    .toLowerCase()
    .replace(nonFilenameCharactersPattern, '-')
    .replace(edgeDashPattern, '')

  return sanitized.length > 0 ? sanitized : 'capture'
}

export function artifactFilePath(outputDir: string, artifactName: string, format: string): string {
  return path.resolve(outputDir, `${sanitizeOutputName(artifactName)}.${format}`)
}

export function captureFilePath(outputDir: string, rootName: string): string {
  return artifactFilePath(outputDir, rootName, 'png')
}

export function assertUniqueCaptureFilePaths(rootNames: string[]): void {
  const seenFilePaths = new Map<string, string>()

  for (const rootName of rootNames) {
    const sanitizedName = sanitizeOutputName(rootName)
    const previousRootName = seenFilePaths.get(sanitizedName)

    if (previousRootName) {
      throw new Error(
        `Capture roots "${previousRootName}" and "${rootName}" both resolve to "${sanitizedName}.png". Root names must map to unique output files.`,
      )
    }

    seenFilePaths.set(sanitizedName, rootName)
  }
}

export function assertUniqueArtifactFilePaths(artifacts: VishotArtifact[]): void {
  const seenFilePaths = new Map<string, string>()

  for (const artifact of artifacts) {
    const previousArtifactName = seenFilePaths.get(artifact.filePath)

    if (previousArtifactName) {
      throw new Error(
        `Artifact outputs "${previousArtifactName}" and "${artifact.artifactName}" both resolve to "${artifact.filePath}". Artifact output file paths must be unique.`,
      )
    }

    seenFilePaths.set(artifact.filePath, artifact.artifactName)
  }
}

export async function assertArtifactFilesExist(artifacts: VishotArtifact[]): Promise<void> {
  for (const artifact of artifacts) {
    try {
      await access(artifact.filePath)
    }
    catch {
      throw new Error(
        `Artifact "${artifact.artifactName}" must point to an existing file on disk at "${artifact.filePath}".`,
      )
    }
  }
}
