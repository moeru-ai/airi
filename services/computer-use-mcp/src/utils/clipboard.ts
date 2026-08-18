import type { ComputerUseConfig } from '../types'

import { platform } from 'node:process'

import { runProcess } from './process'

export interface ClipboardReadResult {
  text: string
  originalLength: number
  returnedLength: number
  trimmed: boolean
  truncated: boolean
}

function requireMacOSClipboard() {
  if (platform !== 'darwin') {
    throw new Error(`system clipboard tools are currently supported on macOS only (current platform: ${platform})`)
  }
}

export function maskClipboardPreview(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return ''
  }

  if (normalized.length <= 8) {
    return `${normalized[0] || ''}${'*'.repeat(Math.max(normalized.length - 2, 0))}${normalized[normalized.length - 1] || ''}`
  }

  return `${normalized.slice(0, 4)}${'*'.repeat(Math.min(12, normalized.length - 8))}${normalized.slice(-4)}`
}

export async function readClipboardText(config: ComputerUseConfig, input: {
  maxLength?: number
  trim?: boolean
}) {
  requireMacOSClipboard()

  const { stdout } = await runProcess(config.binaries.pbpaste, [], {
    timeoutMs: config.timeoutMs,
  })

  const rawText = input.trim === false ? stdout : stdout.trim()
  const maxLength = typeof input.maxLength === 'number' && Number.isFinite(input.maxLength) && input.maxLength > 0
    ? Math.floor(input.maxLength)
    : undefined
  const text = maxLength ? rawText.slice(0, maxLength) : rawText

  return {
    text,
    originalLength: rawText.length,
    returnedLength: text.length,
    trimmed: input.trim !== false,
    truncated: Boolean(maxLength && rawText.length > maxLength),
  } satisfies ClipboardReadResult
}

export async function writeClipboardText(config: ComputerUseConfig, text: string) {
  requireMacOSClipboard()

  await runProcess(config.binaries.pbcopy, [], {
    stdin: text,
    timeoutMs: config.timeoutMs,
  })

  return {
    textLength: text.length,
  }
}
