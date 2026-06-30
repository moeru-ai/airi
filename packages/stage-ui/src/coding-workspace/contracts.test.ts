import { describe, expect, it } from 'vitest'

import { artifactNameForPhase, isSerenaReadOnlyTool, isSpecMode, isV1Engine, nextSpecPhase } from './index'

describe('coding workspace contracts', () => {
  it('maps spec phases to canonical artifact names', () => {
    expect(artifactNameForPhase('requirements')).toBe('requirements.md')
    expect(artifactNameForPhase('design')).toBe('design.md')
    expect(artifactNameForPhase('tasks')).toBe('tasks.md')
  })

  it('advances spec phases in canonical order', () => {
    expect(nextSpecPhase('requirements')).toBe('design')
    expect(nextSpecPhase('design')).toBe('tasks')
    expect(nextSpecPhase('tasks')).toBeUndefined()
  })

  it('detects spec mode only for the spec coding mode', () => {
    expect(isSpecMode('spec')).toBe(true)
    expect(isSpecMode('ask')).toBe(false)
    expect(isSpecMode('code')).toBe(false)
    expect(isSpecMode('debug')).toBe(false)
  })

  it('detects the v1 native coding engine', () => {
    expect(isV1Engine('native')).toBe(true)
    expect(isV1Engine('acp:pi')).toBe(false)
    expect(isV1Engine('acp:codex')).toBe(false)
  })

  it('detects supported read-only Serena tools', () => {
    expect(isSerenaReadOnlyTool('get_symbols_overview')).toBe(true)
    expect(isSerenaReadOnlyTool('find_symbol')).toBe(true)
    expect(isSerenaReadOnlyTool('find_declaration')).toBe(true)
    expect(isSerenaReadOnlyTool('find_referencing_symbols')).toBe(true)
    expect(isSerenaReadOnlyTool('get_diagnostics_for_file')).toBe(true)
    expect(isSerenaReadOnlyTool('search_for_pattern')).toBe(true)
  })

  it('rejects unsupported and mutating Serena tools', () => {
    expect(isSerenaReadOnlyTool('replace_symbol_body')).toBe(false)
    expect(isSerenaReadOnlyTool('insert_before_symbol')).toBe(false)
    expect(isSerenaReadOnlyTool('insert_after_symbol')).toBe(false)
    expect(isSerenaReadOnlyTool('rename_symbol')).toBe(false)
    expect(isSerenaReadOnlyTool('safe_delete_symbol')).toBe(false)
    expect(isSerenaReadOnlyTool('list_dir')).toBe(false)
  })
})
