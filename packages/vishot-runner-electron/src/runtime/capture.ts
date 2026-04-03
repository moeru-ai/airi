import type { Page } from 'playwright'

import type { CaptureOptions } from './types'

import path from 'node:path'

import { mkdir } from 'node:fs/promises'

const nonFilenameCharactersPattern = /[^a-z0-9-_]+/g
const edgeDashPattern = /^-+|-+$/g

function sanitizeCaptureName(name: string): string {
  const sanitized = name
    .trim()
    .toLowerCase()
    .replace(nonFilenameCharactersPattern, '-')
    .replace(edgeDashPattern, '')

  return sanitized.length > 0 ? sanitized : 'capture'
}

export async function capturePage(outputDir: string, name: string, page: Page, options?: CaptureOptions): Promise<string> {
  const filePath = path.resolve(outputDir, `${sanitizeCaptureName(name)}.png`)

  await mkdir(outputDir, { recursive: true })
  await page.screenshot({
    animations: 'disabled',
    fullPage: options?.fullPage ?? false,
    path: filePath,
  })

  return filePath
}
