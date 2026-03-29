/**
 * Path utilities for the singing pipeline.
 */

import { join } from 'node:path'

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
 * Get the file extension from a path.
 */
export function getExtension(filePath: string): string {
  return filePath.split('.').pop()?.toLowerCase() ?? ''
}
