/**
 * Path utilities for the singing pipeline.
 */

import { basename, isAbsolute, join, relative, resolve } from 'node:path'

import { AudioFormat } from '../constants/file-formats'

const SAFE_UPLOAD_EXTENSIONS = new Set([
  AudioFormat.WAV,
  AudioFormat.MP3,
  AudioFormat.FLAC,
  AudioFormat.OGG,
  'aac',
  'aiff',
  'avi',
  'm4a',
  'm4v',
  'mkv',
  'mov',
  'mp4',
  'webm',
  'wma',
])
const INVALID_PATH_SEGMENT_CHARS = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*'])
const NON_ALPHANUMERIC_REGEX = /[^a-z0-9]/g

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
 * Check whether an already-resolved path stays inside the given base directory.
 */
export function isContainedPath(baseDir: string, targetPath: string): boolean {
  const resolvedBaseDir = resolve(baseDir)
  const resolvedTargetPath = resolve(targetPath)
  const relativePath = relative(resolvedBaseDir, resolvedTargetPath)

  return !relativePath.startsWith('..') && !isAbsolute(relativePath)
}

/**
 * Validate a user-controlled filesystem segment that will be reused as both
 * a directory name and a filename stem.
 */
export function isSafePathSegment(segment: string): boolean {
  const normalizedSegment = segment.trim()
  if (!normalizedSegment || normalizedSegment === '.' || normalizedSegment === '..')
    return false

  if (segment !== normalizedSegment)
    return false

  if ([...normalizedSegment].some(char => INVALID_PATH_SEGMENT_CHARS.has(char) || char.charCodeAt(0) < 32))
    return false

  return normalizedSegment === basename(normalizedSegment)
}

/**
 * Resolve a voice model directory under the configured voice model root.
 */
export function resolveVoiceModelDir(voiceModelsDir: string, voiceId: string): string | null {
  if (!isSafePathSegment(voiceId))
    return null

  return resolveContainedPath(voiceModelsDir, voiceId)
}

/**
 * Derive a safe extension from user-controlled upload filenames.
 */
export function getSafeUploadExtension(fileName: string, fallback: string = AudioFormat.WAV): string {
  const normalizedFileName = basename(fileName).toLowerCase()
  const rawExtension = normalizedFileName.split('.').pop() ?? ''
  const safeExtension = rawExtension.replaceAll(NON_ALPHANUMERIC_REGEX, '')

  return SAFE_UPLOAD_EXTENSIONS.has(safeExtension) ? safeExtension : fallback
}

/**
 * Get the file extension from a path.
 */
export function getExtension(filePath: string): string {
  return filePath.split('.').pop()?.toLowerCase() ?? ''
}
