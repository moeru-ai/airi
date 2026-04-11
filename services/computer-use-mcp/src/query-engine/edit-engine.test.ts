import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { applySingleEdit } from './edit-engine'

describe('applySingleEdit failure guidance', () => {
  let workspacePath: string

  beforeEach(() => {
    workspacePath = mkdtempSync(join(tmpdir(), 'airi-edit-engine-'))
  })

  afterEach(() => {
    rmSync(workspacePath, { recursive: true, force: true })
  })

  it('layer 5 failure returns executable guidance instead of raw candidate dump', async () => {
    const filePath = join(workspacePath, 'math.ts')
    writeFileSync(filePath, 'export function add(a, b) {\n  return a + b\n}\n', 'utf-8')

    const result = await applySingleEdit(
      filePath,
      'export function add(a, b) {\n  return a + b + c // guard token\n}\n',
      'export function add(a, b) {\n  return a + b + c\n}\n',
    ) as Record<string, unknown>

    expect(result.success).not.toBe(true)
    expect(String(result.error)).toContain('EDIT FAILED')
    expect(String(result.action_required)).toContain('(A) Copy the EXACT text below')
    expect(String(result.action_required)).toContain('(B) Use start_line=')
    expect(String(result.diagnostic)).toContain('Line')
    expect(String(result.action_required)).not.toContain('"lineStart"')
  })

  it('layer 6 total failure returns actionable instruction and compact preview', async () => {
    const filePath = join(workspacePath, 'unrelated.ts')
    writeFileSync(filePath, 'const alpha = 1\nconst beta = 2\n', 'utf-8')

    const result = await applySingleEdit(
      filePath,
      'totally unrelated payload that should not match any nearby code block',
      'replacement',
    ) as Record<string, unknown>

    expect(result.success).not.toBe(true)
    expect(String(result.error)).toContain('No similar text found')
    expect(String(result.action_required)).toContain('Read the file with read_file')
    expect(typeof result.file_head).toBe('string')
    expect(String(result.action_required)).not.toContain('{"lineStart"')
  })
})
