import type { ComputerUseServerRuntime } from '../server/runtime'
import type { TaskMemory } from '../task-memory/types'
import type { SessionTraceEntry } from '../types'

import { describe, expect, it, vi } from 'vitest'

import { executeSearchPlan } from './retrieval'

import * as search from './search'

describe('retrieval', () => {
  const mockRuntime = {
    session: {
      getRecentTrace: vi.fn(),
    },
    taskMemory: {
      get: vi.fn(),
    },
  } as unknown as ComputerUseServerRuntime

  it('query hits in repo_code returns selectedFiles', async () => {
    vi.spyOn(search, 'searchText').mockResolvedValue({
      total: 2,
      matches: [
        { file: 'src/foo.ts', line: 10, column: 5, snippet: 'const needle = 42' },
        { file: 'src/bar.ts', line: 20, column: 10, snippet: 'needle.doSomething()' },
      ],
    })

    const bundle = await executeSearchPlan(mockRuntime, {
      workspacePath: '/workspace',
      query: 'needle',
      scopes: ['repo_code'],
      limitPerScope: 10,
      maxSelectedFiles: 20,
      maxTraceEntries: 50,
      maxEvidenceItems: 10,
    })

    // Files are deduplicated and sorted deterministically (alphabetically in this case)
    expect(bundle.selectedFiles).toContain('src/foo.ts')
    expect(bundle.selectedFiles).toContain('src/bar.ts')
    expect(bundle.selectedFiles).toHaveLength(2)
    expect(bundle.repoHits).toHaveLength(2)
    expect(bundle.diagnostics.selectionMode).toBe('repo_only')
  })

  it('targetSymbol prioritizes symbol hits over text hits', async () => {
    vi.spyOn(search, 'searchSymbol').mockResolvedValue({
      engine: 'typescript' as const,
      engineDescriptor: {
        id: 'typescript',
        capabilities: { definition: true, reference: true, impact: false },
        supportedExtensions: ['.ts', '.tsx'],
      },
      capabilities: { definition: true, reference: true, impact: false },
      unsupportedReason: null,
      requestedCapability: 'definition' as const,
      matchKind: 'definition' as const,
      symbolName: 'targetFunc',
      searchRoot: '.',
      total: 1,
      limit: 10,
      matches: [
        { file: 'src/symbol.ts', line: 5, column: 10, snippet: 'function targetFunc()' },
      ],
    })

    vi.spyOn(search, 'searchText').mockResolvedValue({
      total: 1,
      matches: [
        { file: 'src/text.ts', line: 15, column: 5, snippet: 'targetFunc is mentioned here' },
      ],
    })

    const bundle = await executeSearchPlan(mockRuntime, {
      workspacePath: '/workspace',
      query: 'targetFunc',
      targetSymbol: 'targetFunc',
      scopes: ['repo_code'],
      limitPerScope: 10,
      maxSelectedFiles: 20,
      maxTraceEntries: 50,
      maxEvidenceItems: 10,
    })

    expect(bundle.selectedFiles[0]).toBe('src/symbol.ts')
    expect(bundle.selectedFiles).toContain('src/text.ts')
    expect(bundle.repoHits.filter(hit => hit.source === 'symbol')).toHaveLength(1)
    expect(bundle.repoHits.filter(hit => hit.source === 'text')).toHaveLength(1)
  })

  it('session_trace hits without repo hits: empty selectedFiles, selectionMode=no_repo_hits', async () => {
    vi.spyOn(search, 'searchText').mockResolvedValue({
      total: 0,
      matches: [],
    })

    const mockTrace: SessionTraceEntry[] = [
      {
        id: 'trace1',
        at: '2026-01-01T00:00:00Z',
        event: 'tool_call',
        toolName: 'coding_search_text',
        metadata: { query: 'needle' },
      },
    ]

    vi.mocked(mockRuntime.session.getRecentTrace).mockReturnValue(mockTrace)

    const bundle = await executeSearchPlan(mockRuntime, {
      workspacePath: '/workspace',
      query: 'needle',
      scopes: ['repo_code', 'session_trace'],
      limitPerScope: 10,
      maxSelectedFiles: 20,
      maxTraceEntries: 50,
      maxEvidenceItems: 10,
    })

    expect(bundle.selectedFiles).toEqual([])
    expect(bundle.traceHits.length).toBeGreaterThan(0)
    expect(bundle.diagnostics.selectionMode).toBe('no_repo_hits')
  })

  it('task_memory hits without repo hits: empty selectedFiles, selectionMode=no_repo_hits', async () => {
    vi.spyOn(search, 'searchText').mockResolvedValue({
      total: 0,
      matches: [],
    })

    const mockTaskMemory: TaskMemory = {
      status: 'active',
      goal: 'Find needle in haystack',
      currentStep: 'Searching for needle',
      confirmedFacts: [],
      artifacts: [],
      blockers: [],
      nextStep: null,
      updatedAt: Date.now(),
      sourceTurnId: 'turn1',
    }

    vi.mocked(mockRuntime.taskMemory.get).mockReturnValue(mockTaskMemory)

    const bundle = await executeSearchPlan(mockRuntime, {
      workspacePath: '/workspace',
      query: 'needle',
      scopes: ['repo_code', 'task_memory'],
      limitPerScope: 10,
      maxSelectedFiles: 20,
      maxTraceEntries: 50,
      maxEvidenceItems: 10,
    })

    expect(bundle.selectedFiles).toEqual([])
    expect(bundle.taskMemoryHits.length).toBeGreaterThan(0)
    expect(bundle.diagnostics.selectionMode).toBe('no_repo_hits')
  })

  it('targetPath enables scoped path bonus', async () => {
    vi.spyOn(search, 'searchText').mockResolvedValue({
      total: 3,
      matches: [
        { file: 'src/utils/helper.ts', line: 10, column: 5, snippet: 'needle found' },
        { file: 'tests/unit/test.ts', line: 20, column: 10, snippet: 'needle test' },
        { file: 'src/utils/main.ts', line: 30, column: 15, snippet: 'needle here' },
      ],
    })

    const bundle = await executeSearchPlan(mockRuntime, {
      workspacePath: '/workspace',
      query: 'needle',
      targetPath: 'src/utils',
      scopes: ['repo_code'],
      limitPerScope: 10,
      maxSelectedFiles: 20,
      maxTraceEntries: 50,
      maxEvidenceItems: 10,
    })

    // Files in src/utils should be prioritized
    expect(bundle.selectedFiles[0]).toMatch(/^src\/utils/)
    expect(bundle.selectedFiles[1]).toMatch(/^src\/utils/)
    expect(bundle.selectedFiles[2]).toBe('tests/unit/test.ts')
  })

  it('uses resolved searchRoot instead of raw targetPath semantics', async () => {
    const searchTextSpy = vi.spyOn(search, 'searchText').mockResolvedValue({
      total: 1,
      matches: [
        { file: 'src/utils/helper.ts', line: 10, column: 5, snippet: 'needle found' },
      ],
    })

    await executeSearchPlan(mockRuntime, {
      workspacePath: '/workspace',
      searchRoot: '/workspace/src/utils',
      query: 'needle',
      targetPath: 'src/utils',
      scopes: ['repo_code'],
      limitPerScope: 10,
      maxSelectedFiles: 20,
      maxTraceEntries: 50,
      maxEvidenceItems: 10,
    })

    expect(searchTextSpy).toHaveBeenCalledWith('/workspace', 'needle', expect.objectContaining({
      searchRoot: '/workspace/src/utils',
      limit: 10,
    }))
  })

  it('evidence snippets are truncated properly', async () => {
    // Note: search.ts already truncates snippets via toSingleLineSnippet
    // This test verifies that truncated snippets pass through correctly
    const truncatedSnippet = `${'a'.repeat(159)}…`

    vi.spyOn(search, 'searchText').mockResolvedValue({
      total: 1,
      matches: [
        { file: 'src/long.ts', line: 10, column: 5, snippet: truncatedSnippet },
      ],
    })

    const bundle = await executeSearchPlan(mockRuntime, {
      workspacePath: '/workspace',
      query: 'aaa',
      scopes: ['repo_code'],
      limitPerScope: 10,
      maxSelectedFiles: 20,
      maxTraceEntries: 50,
      maxEvidenceItems: 10,
    })

    expect(bundle.repoHits[0].snippet).toBe(truncatedSnippet)
    expect(bundle.repoHits[0].snippet.length).toBeLessThanOrEqual(161)
  })

  it('repo_plus_context mode when both repo and context hits exist', async () => {
    vi.spyOn(search, 'searchText').mockResolvedValue({
      total: 1,
      matches: [
        { file: 'src/foo.ts', line: 10, column: 5, snippet: 'needle' },
      ],
    })

    const mockTrace: SessionTraceEntry[] = [
      {
        id: 'trace1',
        at: '2026-01-01T00:00:00Z',
        event: 'tool_call',
        metadata: { detail: 'needle' },
      },
    ]

    vi.mocked(mockRuntime.session.getRecentTrace).mockReturnValue(mockTrace)

    const bundle = await executeSearchPlan(mockRuntime, {
      workspacePath: '/workspace',
      query: 'needle',
      scopes: ['repo_code', 'session_trace'],
      limitPerScope: 10,
      maxSelectedFiles: 20,
      maxTraceEntries: 50,
      maxEvidenceItems: 10,
    })

    expect(bundle.selectedFiles).toHaveLength(1)
    expect(bundle.traceHits.length).toBeGreaterThan(0)
    expect(bundle.diagnostics.selectionMode).toBe('repo_plus_context')
  })

  it('deduplicates files from symbol and text hits', async () => {
    vi.spyOn(search, 'searchSymbol').mockResolvedValue({
      engine: 'typescript' as const,
      engineDescriptor: {
        id: 'typescript',
        capabilities: { definition: true, reference: true, impact: false },
        supportedExtensions: ['.ts', '.tsx'],
      },
      capabilities: { definition: true, reference: true, impact: false },
      unsupportedReason: null,
      requestedCapability: 'definition' as const,
      matchKind: 'definition' as const,
      symbolName: 'shared',
      searchRoot: '.',
      total: 1,
      limit: 10,
      matches: [
        { file: 'src/shared.ts', line: 5, column: 10, snippet: 'function shared()' },
      ],
    })

    vi.spyOn(search, 'searchText').mockResolvedValue({
      total: 1,
      matches: [
        { file: 'src/shared.ts', line: 15, column: 5, snippet: 'shared is used here' },
      ],
    })

    const bundle = await executeSearchPlan(mockRuntime, {
      workspacePath: '/workspace',
      query: 'shared',
      targetSymbol: 'shared',
      scopes: ['repo_code'],
      limitPerScope: 10,
      maxSelectedFiles: 20,
      maxTraceEntries: 50,
      maxEvidenceItems: 10,
    })

    expect(bundle.selectedFiles).toEqual(['src/shared.ts'])
    expect(bundle.repoHits).toHaveLength(2) // Both hits kept in repoHits
  })
})
