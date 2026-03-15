import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  clampSearchLimit,
  findReferences,
  getPluggableSemanticEngineRegistry,
  searchSymbol,
  searchText,
  SEMANTIC_FALLBACK_TOOL,
  toSingleLineSnippet,
} from './search'

function hasRipgrep() {
  const result = spawnSync('rg', ['--version'], { encoding: 'utf8' })
  return result.status === 0
}

describe('coding search contracts', () => {
  it('exposes pluggable semantic engine registry snapshot', () => {
    const registry = getPluggableSemanticEngineRegistry()
    expect(Array.isArray(registry)).toBe(true)
    expect(registry.length).toBeGreaterThan(0)
    expect(registry.some(engine => engine.id === 'typescript')).toBe(true)
    const tsEngine = registry.find(engine => engine.id === 'typescript')
    expect(tsEngine?.capabilityFlags.definition).toBe(true)
    expect((tsEngine as any)?.capabilities?.definition).toBe(true)
    expect(tsEngine?.capabilityFlags.reference).toBe(true)
    expect(tsEngine?.capabilityFlags.impact).toBe(false)
  })

  it('clamps search limits deterministically', () => {
    expect(clampSearchLimit(undefined)).toBe(10)
    expect(clampSearchLimit(0)).toBe(10)
    expect(clampSearchLimit(3)).toBe(3)
    expect(clampSearchLimit(999)).toBe(20)
  })

  it('normalizes snippets into one line with max length 160', () => {
    const snippet = toSingleLineSnippet('a\n'.repeat(200))
    expect(snippet.includes('\n')).toBe(false)
    expect(snippet.length).toBeLessThanOrEqual(160)
    expect(snippet.endsWith('…')).toBe(true)
  })

  it('searchText enforces clamp/snippet/path contracts', async () => {
    if (!hasRipgrep()) {
      return
    }

    const workspace = await mkdtemp(join(tmpdir(), 'airi-search-text-'))
    try {
      const filePath = join(workspace, 'src', 'sub', 'example.ts')
      await mkdir(join(workspace, 'src', 'sub'), { recursive: true })
      const longTail = 'x'.repeat(220)
      const lines = Array.from({ length: 25 }, (_, i) => `const q${i} = "needle_token_${i} ${longTail}"`).join('\n')
      await writeFile(filePath, lines, 'utf8')

      const result = await searchText(workspace, 'needle_token_', {
        searchRoot: join(workspace, 'src'),
        limit: 200,
      })

      expect(result.total).toBe(25)
      expect(result.matches.length).toBe(20)
      expect(result.matches[0]?.file).toBe('src/sub/example.ts')
      expect(result.matches[0]?.snippet.length).toBeLessThanOrEqual(160)
    }
    finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })

  it('searchSymbol returns structured unsupported for non-js/ts glob', async () => {
    const result = await searchSymbol('/tmp', 'Foo', { glob: '*.py' })
    expect('status' in result).toBe(true)
    if ('status' in result) {
      expect(result.status).toBe('unsupported')
      expect(result.explanation).toContain('coding_search_text')
      expect(result.fallbackTool).toBe(SEMANTIC_FALLBACK_TOOL)
      expect(result.fallbackEntrypoint).toBe('text_search')
      expect(result.requestedCapability).toBe('definition')
      expect(result.reasonCode).toBe('unsupported_glob')
      expect(result.unsupportedReason.code).toBe('unsupported_glob')
      expect(result.unsupportedReason.requestedCapability).toBe('definition')
      expect(result.engine).toBeUndefined()
    }
  })

  it('searchSymbol returns engine and matchKind for JS/TS definitions', async () => {
    if (!hasRipgrep()) {
      return
    }

    const workspace = await mkdtemp(join(tmpdir(), 'airi-search-symbol-'))
    try {
      await writeFile(join(workspace, 'index.ts'), 'export function HelloWorld() { return 1 }\n', 'utf8')
      const result = await searchSymbol(workspace, 'HelloWorld', { limit: 20 })

      if ('status' in result) {
        throw new Error(`unexpected unsupported: ${result.explanation}`)
      }

      expect(result.engine).toBe('typescript')
      expect((result as any).engineDescriptor?.id).toBe('typescript')
      expect((result as any).capabilities?.definition).toBe(true)
      expect((result as any).unsupportedReason).toBeNull()
      expect(result.matchKind).toBe('definition')
      expect(result.matches.length).toBeGreaterThan(0)
      expect(result.matches[0]?.file).toBe('index.ts')
    }
    finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })

  it('findReferences returns structured unsupported for non-js/ts file', async () => {
    const result = await findReferences('/tmp', 'main.py', 1, 1)
    expect('status' in result).toBe(true)
    if ('status' in result) {
      expect(result.status).toBe('unsupported')
      expect(result.explanation).toContain('coding_search_text')
      expect(result.fallbackTool).toBe(SEMANTIC_FALLBACK_TOOL)
      expect(result.fallbackEntrypoint).toBe('text_search')
      expect(result.requestedCapability).toBe('reference')
      expect(result.reasonCode).toBe('unsupported_file_extension')
      expect(result.unsupportedReason.code).toBe('unsupported_file_extension')
      expect(result.unsupportedReason.requestedCapability).toBe('reference')
    }
  })

  it('findReferences returns typescript engine with isWriteAccess', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'airi-find-ref-'))
    try {
      await writeFile(join(workspace, 'tsconfig.json'), JSON.stringify({ compilerOptions: { module: 'ESNext', target: 'ES2020' } }), 'utf8')
      await writeFile(join(workspace, 'a.ts'), 'export const foo = 1\nexport const bar = foo + 1\n', 'utf8')
      await writeFile(join(workspace, 'b.ts'), 'import { foo } from "./a"\nexport const baz = foo\n', 'utf8')

      const result = await findReferences(workspace, 'a.ts', 1, 14, 20)

      if ('status' in result) {
        throw new Error(`unexpected unsupported: ${result.explanation}`)
      }

      expect(result.engine).toBe('typescript')
      expect((result as any).engineDescriptor?.id).toBe('typescript')
      expect((result as any).capabilities?.reference).toBe(true)
      expect((result as any).unsupportedReason).toBeNull()
      expect(result.total).toBeGreaterThan(0)
      expect(result.matches.some(match => match.file === 'b.ts')).toBe(true)
      expect(typeof result.matches[0]?.isWriteAccess).toBe('boolean')
    }
    finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })
})
