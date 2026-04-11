import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { applySingleEdit, findUndocumentedExports } from './edit-engine'

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

describe('applySingleEdit no-op detection', () => {
  let workspacePath: string

  beforeEach(() => {
    workspacePath = mkdtempSync(join(tmpdir(), 'airi-edit-noop-'))
  })

  afterEach(() => {
    rmSync(workspacePath, { recursive: true, force: true })
  })

  it('exact match: returns error when old_text === new_text', async () => {
    const filePath = join(workspacePath, 'foo.ts')
    const content = 'export function foo() {\n  return 1\n}\n'
    writeFileSync(filePath, content, 'utf-8')

    const result = await applySingleEdit(
      filePath,
      'export function foo() {\n  return 1\n}',
      'export function foo() {\n  return 1\n}', // same as old_text
    ) as Record<string, unknown>

    expect(result.success).not.toBe(true)
    expect(String(result.error)).toContain('NO-OP')
    expect(String(result.matchType)).toContain('noop')
    // File should NOT have been modified
    expect(readFileSync(filePath, 'utf-8')).toBe(content)
  })

  it('line-range: returns error when replacement yields identical file', async () => {
    const filePath = join(workspacePath, 'bar.ts')
    const content = 'line1\nline2\nline3\n'
    writeFileSync(filePath, content, 'utf-8')

    const result = await applySingleEdit(
      filePath,
      '', // old_text not checked in line-range mode when empty
      'line2', // replace line 2 with identical content
      2, // startLine
      2, // endLine
    ) as Record<string, unknown>

    expect(result.success).not.toBe(true)
    expect(String(result.error)).toContain('NO-OP')
    expect(readFileSync(filePath, 'utf-8')).toBe(content)
  })

  it('exact match: real edit still succeeds', async () => {
    const filePath = join(workspacePath, 'baz.ts')
    const content = 'export function foo() {\n  return 1\n}\n'
    writeFileSync(filePath, content, 'utf-8')

    const result = await applySingleEdit(
      filePath,
      'return 1',
      'return 42', // actually different
    ) as Record<string, unknown>

    expect(result.success).toBe(true)
    expect(readFileSync(filePath, 'utf-8')).toContain('return 42')
  })

  it('whitespace-normalized match: returns error when result is identical', async () => {
    const filePath = join(workspacePath, 'ws.ts')
    // File has double spaces
    const content = 'const  x  =  1\n'
    writeFileSync(filePath, content, 'utf-8')

    // Agent sends single-space version as old + new (identical after normalization)
    const result = await applySingleEdit(
      filePath,
      'const x = 1',
      'const  x  =  1', // matches the original after WS normalization → no-op
    ) as Record<string, unknown>

    // This should detect no-op because the replacement (which matches the
    // original range in the file) produces identical file content
    expect(result.success).not.toBe(true)
    expect(String(result.error)).toContain('NO-OP')
    expect(readFileSync(filePath, 'utf-8')).toBe(content)
  })
})

describe('findUndocumentedExports', () => {
  it('detects undocumented exports (no JSDoc)', () => {
    const lines = [
      'export function foo() {',
      '  return 1',
      '}',
      '',
      'export const bar = 42',
    ]
    const { undocumented, documented } = findUndocumentedExports(lines)
    expect(undocumented).toHaveLength(2)
    expect(undocumented[0]!.name).toBe('foo')
    expect(undocumented[1]!.name).toBe('bar')
    expect(documented).toBe(0)
  })

  it('skips exports that have JSDoc', () => {
    const lines = [
      '/** This is documented */',
      'export function foo() {',
      '  return 1',
      '}',
      '',
      'export function bar() {',
      '  return 2',
      '}',
    ]
    const { undocumented, documented } = findUndocumentedExports(lines)
    expect(documented).toBe(1)
    expect(undocumented).toHaveLength(1)
    expect(undocumented[0]!.name).toBe('bar')
  })

  it('skips exports with multi-line JSDoc', () => {
    const lines = [
      '/**',
      ' * Multi-line JSDoc',
      ' * @returns number',
      ' */',
      'export function documented() {',
      '  return 1',
      '}',
      '',
      'export function undocumented() {',
      '  return 2',
      '}',
    ]
    const { undocumented, documented } = findUndocumentedExports(lines)
    expect(documented).toBe(1)
    expect(undocumented).toHaveLength(1)
    expect(undocumented[0]!.name).toBe('undocumented')
  })

  it('returns empty for files without exports', () => {
    const lines = ['const x = 1', 'const y = 2']
    const { undocumented, documented } = findUndocumentedExports(lines)
    expect(undocumented).toHaveLength(0)
    expect(documented).toBe(0)
  })

  it('skips exports with consecutive // comments', () => {
    const lines = [
      '// This is the foo function',
      '// It returns one',
      'export function foo() {',
      '  return 1',
      '}',
    ]
    const { undocumented, documented } = findUndocumentedExports(lines)
    expect(documented).toBe(1)
    expect(undocumented).toHaveLength(0)
  })

  it('python: detects undocumented defs', () => {
    const lines = [
      'def undocumented_func():',
      '    pass',
      '',
      '"""Documented function"""',
      'def documented_func():',
      '    pass',
    ]
    const { undocumented, documented } = findUndocumentedExports(lines)
    expect(undocumented).toHaveLength(1)
    expect(undocumented[0]!.name).toBe('undocumented_func')
    expect(documented).toBe(1)
  })
})
