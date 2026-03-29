/**
 * Path utilities for the singing pipeline.
 */

import { isAbsolute, join, relative, resolve } from 'node:path'

/**
 * Build the job directory path: <baseDir>/jobs/<jobId>
 * Uses path.join for cross-platform compatibility.
 */
export function buildJobDir(baseDir: string, jobId: string): string {
  return join(baseDir, 'jobs', jobId)
}

/**
 * Build the uploads directory path: <baseDir>/uploads/
 */
export function buildUploadsDir(baseDir: string): string {
  return join(baseDir, 'uploads')
}

/**
 * Resolve a user-supplied artifact path and reject paths that escape the base directory.
 */
export function resolveContainedPath(baseDir: string, artifactPath: string): string | null {
  const resolvedBaseDir = resolve(baseDir)
  const resolvedArtifactPath = resolve(resolvedBaseDir, artifactPath)
  const relativePath = relative(resolvedBaseDir, resolvedArtifactPath)

  if (relativePath.startsWith('..') || isAbsolute(relativePath))
    return null

  return resolvedArtifactPath
}

/**
 * Get the file extension from a path.
 */
export function getExtension(filePath: string): string {
  return filePath.split('.').pop()?.toLowerCase() ?? ''
}
