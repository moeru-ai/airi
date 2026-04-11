import type { LLMResponse, QueryEngineConfig, QueryMessage, ToolCall } from './types'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { runQueryEngine } from './engine'
import { callLLMStreaming } from './streaming'
import { buildToolRoutes, executeToolCall } from './tool-router'
import { verifyModifiedFiles } from './verification'

vi.mock('./streaming', () => ({
  callLLMStreaming: vi.fn(),
}))

vi.mock('./tool-router', () => ({
  buildToolRoutes: vi.fn(() => ({})),
  getToolDefinitions: vi.fn(() => []),
  executeToolCall: vi.fn(),
}))

vi.mock('./verification', () => ({
  verifyModifiedFiles: vi.fn(async () => []),
}))

function createConfig(overrides: Partial<QueryEngineConfig> = {}): QueryEngineConfig {
  return {
    model: 'test-model',
    apiKey: 'test-key',
    baseURL: 'https://example.invalid/v1',
    maxTurns: 12,
    maxToolCalls: 20,
    maxTokenBudget: 100_000,
    approvalMode: 'auto',
    ...overrides,
  }
}

function createResponse(overrides: Partial<LLMResponse> = {}): LLMResponse {
  return {
    content: null,
    toolCalls: [],
    finishReason: 'stop',
    usage: {
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    },
    ...overrides,
  }
}

function hasMessage(messages: QueryMessage[], snippet: string) {
  return messages.some((message) => {
    if (message.role === 'assistant' || message.role === 'tool')
      return false
    return message.content.includes(snippet)
  })
}

function createToolCall(name: string, args: Record<string, unknown>, id = `tc-${name}`): ToolCall {
  return {
    id,
    type: 'function',
    function: {
      name,
      arguments: JSON.stringify(args),
    },
  }
}

describe('runQueryEngine regressions', () => {
  const workspacePath = '/tmp/query-engine-regression'
  const primitives = {} as any
  const terminal = {
    execute: vi.fn(),
    getState: vi.fn(),
    resetState: vi.fn(),
    describe: vi.fn(),
  } as any

  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(buildToolRoutes).mockReturnValue({})
    vi.mocked(executeToolCall).mockResolvedValue({ result: 'ok', error: false })
    vi.mocked(verifyModifiedFiles).mockResolvedValue([])
  })

  // ─── Core loop behavior ───

  it('does not exit immediately on first text-only response (nudges until budget)', async () => {
    // general_fix goal: completion guard blocks exit until files modified
    vi.mocked(callLLMStreaming)
      .mockResolvedValue(createResponse({ content: 'Thinking...' }))

    const result = await runQueryEngine({
      goal: 'Do something',
      workspacePath,
      primitives,
      terminal,
      config: createConfig({ maxTurns: 100, maxTokenBudget: 200 }),
    })

    // Without any file modifications, the guard prevents finalization
    expect(result.status).toBe('budget_exhausted')
    expect(vi.mocked(callLLMStreaming).mock.calls.length).toBeGreaterThan(3)
  })

  it.each(['edit_file', 'write_file'] as const)(
    'does not include failed %s in filesModified',
    async (toolName) => {
      const toolCall: ToolCall = {
        id: `tc-${toolName}`,
        type: 'function',
        function: {
          name: toolName,
          arguments: JSON.stringify({
            file_path: 'src/fail.ts',
            old_text: 'old',
            new_text: 'new',
            content: 'replacement',
          }),
        },
      }

      vi.mocked(callLLMStreaming)
        .mockResolvedValueOnce(createResponse({ content: 'Trying edit', toolCalls: [toolCall] }))
        .mockResolvedValue(createResponse({ content: 'text only response' }))

      vi.mocked(executeToolCall).mockResolvedValue({
        result: 'mutation failed',
        error: true,
      })

      const result = await runQueryEngine({
        goal: 'Attempt failing mutation',
        workspacePath,
        primitives,
        terminal,
        config: createConfig({ maxTurns: 100, maxTokenBudget: 200 }),
      })

      // With completion guard, failed edits mean no files modified → budget_exhausted
      expect(result.status).toBe('budget_exhausted')
      expect(result.filesModified).toEqual([])
    },
  )

  // ─── Phase 2: Completion guard prevents premature exit ───

  it('analysis task: does not finalize without writing a report', async () => {
    // Agent does some reading then tries to finalize with text-only
    const readCall = createToolCall('read_file', { file_path: 'src/a.ts' })

    // First response has a tool call, rest are text-only
    vi.mocked(callLLMStreaming)
      .mockResolvedValueOnce(createResponse({ content: 'reading', toolCalls: [readCall] }))
      .mockResolvedValue(createResponse({ content: 'text only response' }))

    vi.mocked(executeToolCall).mockResolvedValue({ result: '{"ok": true}', error: false })

    const result = await runQueryEngine({
      goal: 'Analyze the workspace and write a report',
      workspacePath,
      primitives,
      terminal,
      config: createConfig({ maxTurns: 100, maxTokenBudget: 200 }),
    })

    // The guard should have kept nudging, eventually budget_exhausted
    // because it never wrote a report, so canFinalize stayed false.
    expect(result.status).toBe('budget_exhausted')

    // Check that the nudge contained the right instruction
    const calls = vi.mocked(callLLMStreaming).mock.calls
    const secondMessages = calls[1]?.[0].messages as QueryMessage[]
    expect(hasMessage(secondMessages, 'TASK INCOMPLETE')).toBe(true)
    expect(hasMessage(secondMessages, 'write_file')).toBe(true)
  })

  it('existing_file_edit task: does not finalize without editing', async () => {
    const readCall = createToolCall('read_file', { file_path: 'src/foo.ts' })

    vi.mocked(callLLMStreaming)
      .mockResolvedValueOnce(createResponse({ content: 'reading target', toolCalls: [readCall] }))
      .mockResolvedValue(createResponse({ content: 'text only response' }))

    vi.mocked(executeToolCall).mockResolvedValue({ result: '{"ok": true}', error: false })

    const result = await runQueryEngine({
      goal: 'Fix the type error in src/foo.ts',
      workspacePath,
      primitives,
      terminal,
      config: createConfig({ maxTurns: 100, maxTokenBudget: 200 }),
    })

    expect(result.status).toBe('budget_exhausted')

    const calls = vi.mocked(callLLMStreaming).mock.calls
    const secondMessages = calls[1]?.[0].messages as QueryMessage[]
    expect(hasMessage(secondMessages, 'TASK INCOMPLETE')).toBe(true)
    expect(hasMessage(secondMessages, 'edit_file')).toBe(true)
  })

  it('verification_heavy task: does not finalize without running verification', async () => {
    vi.mocked(callLLMStreaming)
      .mockResolvedValue(createResponse({ content: 'text only response' }))

    const result = await runQueryEngine({
      goal: 'Run tests to verify the build is green',
      workspacePath,
      primitives,
      terminal,
      config: createConfig({ maxTurns: 100, maxTokenBudget: 200 }),
    })

    expect(result.turnsUsed).toBeGreaterThan(3) // Should have been nudged past 3 text-only rounds
    expect(result.status).toBe('budget_exhausted')

    const calls = vi.mocked(callLLMStreaming).mock.calls
    const firstMessages = calls[0]?.[0].messages as QueryMessage[]
    const secondMessages = calls[1]?.[0].messages as QueryMessage[]
    // First response is text-only. Guard should say: run verification!
    expect(hasMessage(secondMessages, 'TASK INCOMPLETE')).toBe(true)
    expect(hasMessage(secondMessages, 'bash')).toBe(true)
  })

  it('analysis task: finalizes normally when report is written and read back', async () => {
    const readCall = createToolCall('read_file', { file_path: 'src/a.ts' })
    const writeCall = createToolCall('write_file', { file_path: 'report.md', content: '# Report\n...' })
    const readBackCall = createToolCall('read_file', { file_path: 'report.md' })

    vi.mocked(callLLMStreaming)
      .mockResolvedValueOnce(createResponse({ content: 'reading', toolCalls: [readCall] }))
      .mockResolvedValueOnce(createResponse({ content: 'writing report', toolCalls: [writeCall] }))
      .mockResolvedValueOnce(createResponse({ content: 'read back', toolCalls: [readBackCall] }))
      .mockResolvedValueOnce(createResponse({ content: 'Complete.' }))
      .mockResolvedValueOnce(createResponse({ content: 'Finished.' }))
      .mockResolvedValueOnce(createResponse({ content: 'Done.' }))

    vi.mocked(executeToolCall).mockResolvedValue({ result: '{"ok": true}', error: false })

    const result = await runQueryEngine({
      goal: 'Analyze the workspace and write a report',
      workspacePath,
      primitives,
      terminal,
      config: createConfig(),
    })

    expect(result.status).toBe('completed')
  })

  it('existing_file_edit task: finalizes when file is edited and read back', async () => {
    const readCall = createToolCall('read_file', { file_path: 'src/foo.ts' })
    const editCall = createToolCall('edit_file', { file_path: 'src/foo.ts', old_text: 'old', new_text: 'new' })
    const readBackCall = createToolCall('read_file', { file_path: 'src/foo.ts' })

    vi.mocked(callLLMStreaming)
      .mockResolvedValueOnce(createResponse({ content: 'reading', toolCalls: [readCall] }))
      .mockResolvedValueOnce(createResponse({ content: 'editing', toolCalls: [editCall] }))
      .mockResolvedValueOnce(createResponse({ content: 'verifying', toolCalls: [readBackCall] }))
      .mockResolvedValueOnce(createResponse({ content: 'Done.' }))
      .mockResolvedValueOnce(createResponse({ content: 'Finished.' }))

    vi.mocked(executeToolCall).mockResolvedValue({ result: '{"success": true}', error: false })

    const result = await runQueryEngine({
      goal: 'Fix the type error in src/foo.ts',
      workspacePath,
      primitives,
      terminal,
      config: createConfig(),
    })

    expect(result.status).toBe('completed')
    expect(result.filesModified).toContain('src/foo.ts')
  })

  it('existing_file_edit task: reading unrelated file does NOT count as readback', async () => {
    const readCall = createToolCall('read_file', { file_path: 'src/foo.ts' })
    const editCall = createToolCall('edit_file', { file_path: 'src/foo.ts', old_text: 'old', new_text: 'new' })
    // Read a DIFFERENT file — this should not satisfy readBackDone
    const readOtherCall = createToolCall('read_file', { file_path: 'src/bar.ts' })

    vi.mocked(callLLMStreaming)
      .mockResolvedValueOnce(createResponse({ content: 'reading', toolCalls: [readCall] }))
      .mockResolvedValueOnce(createResponse({ content: 'editing', toolCalls: [editCall] }))
      .mockResolvedValueOnce(createResponse({ content: 'reading other', toolCalls: [readOtherCall] }))
      .mockResolvedValue(createResponse({ content: 'text only to exhaust' }))

    vi.mocked(executeToolCall).mockResolvedValue({ result: '{"success": true}', error: false })

    const result = await runQueryEngine({
      goal: 'Fix the type error in src/foo.ts',
      workspacePath,
      primitives,
      terminal,
      config: createConfig({ maxTurns: 100, maxTokenBudget: 200 }),
    })

    // readBackDone should NOT be true since we read src/bar.ts not src/foo.ts
    expect(result.status).toBe('budget_exhausted')
  })

  it('existing_file_edit task: write_file does NOT satisfy existingFileEdited', async () => {
    const readCall = createToolCall('read_file', { file_path: 'src/foo.ts' })
    // Use write_file instead of edit_file — this should NOT count as existingFileEdited
    const writeCall = createToolCall('write_file', { file_path: 'src/new-file.ts', content: 'const x = 1;' })
    const readBackCall = createToolCall('read_file', { file_path: 'src/new-file.ts' })

    vi.mocked(callLLMStreaming)
      .mockResolvedValueOnce(createResponse({ content: 'reading', toolCalls: [readCall] }))
      .mockResolvedValueOnce(createResponse({ content: 'writing', toolCalls: [writeCall] }))
      .mockResolvedValueOnce(createResponse({ content: 'reading back', toolCalls: [readBackCall] }))
      .mockResolvedValue(createResponse({ content: 'text only to exhaust' }))

    vi.mocked(executeToolCall).mockResolvedValue({ result: '{"ok": true}', error: false })

    const result = await runQueryEngine({
      goal: 'Fix the type error in src/foo.ts',
      workspacePath,
      primitives,
      terminal,
      config: createConfig({ maxTurns: 100, maxTokenBudget: 200 }),
    })

    // write_file doesn't count as edit, so completion guard blocks
    expect(result.status).toBe('budget_exhausted')
  })

  it('completion guard does NOT bypass at 90% budget', async () => {
    // 12 maxTurns, 90% = 10.8 → previously at turn 10 it would bypass
    vi.mocked(callLLMStreaming)
      .mockResolvedValue(createResponse({ content: 'text only response' }))

    const result = await runQueryEngine({
      goal: 'Fix the type error in src/foo.ts',
      workspacePath,
      primitives,
      terminal,
      config: createConfig({ maxTurns: 12, maxTokenBudget: 300 }),
    })

    // Without the 90% bypass, the guard should NOT let it finalize
    expect(result.status).toBe('budget_exhausted')
    expect(result.turnsUsed).toBe(12)
  })

  // ─── Phase 3: Bash Penalty ───

  it('phase 3: injects strong nudge when bash discovery is overused', async () => {
    // 3 discovery bashes = nudge threshold
    const bashCalls = Array.from({ length: 4 }).map((_, i) =>
      createToolCall('bash', { command: `ls -la subdir${i}` }, `tc-bash-${i}`),
    )

    vi.mocked(callLLMStreaming)
      .mockResolvedValueOnce(createResponse({ content: 'c1', toolCalls: [bashCalls[0]!] }))
      .mockResolvedValueOnce(createResponse({ content: 'c2', toolCalls: [bashCalls[1]!] }))
      .mockResolvedValueOnce(createResponse({ content: 'c3', toolCalls: [bashCalls[2]!] })) // Threshold reached
      .mockResolvedValueOnce(createResponse({ content: 'c4', toolCalls: [bashCalls[3]!] })) // 4th will be rejected
      .mockResolvedValue(createResponse({ content: 'text only to exhaust' }))

    vi.mocked(executeToolCall).mockResolvedValue({ result: '{"stdout": "ok"}', error: false })

    await runQueryEngine({
      // Analysis task has strict penalty thresholds (2 for nudge, 3 for reject)
      goal: 'Analyze the workspace and write a report',
      workspacePath,
      primitives,
      terminal,
      config: createConfig({ maxTurns: 5 }),
    })

    const calls = vi.mocked(callLLMStreaming).mock.calls
    // Evaluate the LLM input messages to the 3rd LLM call (calls[2])
    // The previous turn (turn 2) crossed the threshold (2), so a system message should be pushed
    const thirdMessages = calls[2]?.[0].messages as QueryMessage[]
    expect(hasMessage(thirdMessages, 'BASH OVERUSE WARNING')).toBe(true)
  })

  it('phase 3: outright rejects bash discovery when penalty threshold exceeded', async () => {
    const bashCalls = Array.from({ length: 4 }).map((_, i) =>
      createToolCall('bash', { command: `ls -la subdir${i}` }, `tc-bash-${i}`),
    )

    vi.mocked(callLLMStreaming)
      .mockResolvedValueOnce(createResponse({ content: 'c1', toolCalls: [bashCalls[0]!] }))
      .mockResolvedValueOnce(createResponse({ content: 'c2', toolCalls: [bashCalls[1]!] }))
      .mockResolvedValueOnce(createResponse({ content: 'c3', toolCalls: [bashCalls[2]!] })) // Threshold reached
      .mockResolvedValueOnce(createResponse({ content: 'c4', toolCalls: [bashCalls[3]!] })) // Should be hard rejected
      .mockResolvedValue(createResponse({ content: 'text only to exhaust' }))

    vi.mocked(executeToolCall).mockResolvedValue({ result: '{"stdout": "ok"}', error: false })

    await runQueryEngine({
      goal: 'Analyze the workspace and write a report',
      workspacePath,
      primitives,
      terminal,
      config: createConfig({ maxTurns: 5 }),
    })

    const calls = vi.mocked(callLLMStreaming).mock.calls
    // Examine the system prompt/messages on turn 5 (calls[4])
    // Turn 4 bash should result in an ERROR slot in the tool list
    const fifthMessages = calls[4]?.[0].messages as QueryMessage[]
    const toolMsg = fifthMessages.find(m => m.role === 'tool' && m.content.includes('BASH DISCOVERY REJECTED'))
    expect(toolMsg).toBeDefined()

    // And executeToolCall should NOT have been called for the 4th bash invocation
    // It is called 3 times, not 4.
    expect(vi.mocked(executeToolCall)).toHaveBeenCalledTimes(3)
  })

  // ─── Exploration nudge for existing_file_edit ───

  it('existing_file_edit: gets edit_file nudge after DISCOVER_LIMIT read-only turns', async () => {
    // maxTurns=10 → DISCOVER_LIMIT = min(4, floor(10*0.25)) = 2
    // After 2 read-only turns, the nudge should fire
    const readCall1 = createToolCall('read_file', { file_path: 'src/foo.ts' }, 'tc-read-1')
    const readCall2 = createToolCall('read_file', { file_path: 'src/bar.ts' }, 'tc-read-2')
    const readCall3 = createToolCall('read_file', { file_path: 'src/baz.ts' }, 'tc-read-3')

    vi.mocked(callLLMStreaming)
      .mockResolvedValueOnce(createResponse({ content: 'exploring', toolCalls: [readCall1] }))
      .mockResolvedValueOnce(createResponse({ content: 'still exploring', toolCalls: [readCall2] }))
      .mockResolvedValueOnce(createResponse({ content: 'more exploring', toolCalls: [readCall3] }))
      .mockResolvedValue(createResponse({ content: 'text only' }))

    vi.mocked(executeToolCall).mockResolvedValue({ result: '{"ok": true}', error: false })

    await runQueryEngine({
      goal: 'Fix the type error in src/foo.ts',
      workspacePath,
      primitives,
      terminal,
      config: createConfig({ maxTurns: 10, maxTokenBudget: 200 }),
    })

    const calls = vi.mocked(callLLMStreaming).mock.calls
    // After turn 2 (2 read-only), the nudge should be injected before turn 3
    const thirdMessages = calls[2]?.[0].messages as QueryMessage[]
    // Should contain 'call edit_file now' nudge (role: user)
    expect(hasMessage(thirdMessages, 'call edit_file now')).toBe(true)
  })

  it('existing_file_edit: escalated CRITICAL nudge after 2× DISCOVER_LIMIT', async () => {
    // maxTurns=10, DISCOVER_LIMIT=2, escalation at 4
    const readCalls = Array.from({ length: 5 }).map((_, i) =>
      createToolCall('read_file', { file_path: `src/file${i}.ts` }, `tc-read-${i}`),
    )

    vi.mocked(callLLMStreaming)
      .mockResolvedValueOnce(createResponse({ content: 'r1', toolCalls: [readCalls[0]!] }))
      .mockResolvedValueOnce(createResponse({ content: 'r2', toolCalls: [readCalls[1]!] }))
      .mockResolvedValueOnce(createResponse({ content: 'r3', toolCalls: [readCalls[2]!] }))
      .mockResolvedValueOnce(createResponse({ content: 'r4', toolCalls: [readCalls[3]!] }))
      .mockResolvedValueOnce(createResponse({ content: 'r5', toolCalls: [readCalls[4]!] }))
      .mockResolvedValue(createResponse({ content: 'text only' }))

    vi.mocked(executeToolCall).mockResolvedValue({ result: '{"ok": true}', error: false })

    await runQueryEngine({
      goal: 'Fix the type error in src/foo.ts',
      workspacePath,
      primitives,
      terminal,
      config: createConfig({ maxTurns: 10, maxTokenBudget: 250 }),
    })

    const calls = vi.mocked(callLLMStreaming).mock.calls
    // After turn 4 (4 read-only = 2× DISCOVER_LIMIT), escalated nudge fires
    const fifthMessages = calls[4]?.[0].messages as QueryMessage[]
    expect(hasMessage(fifthMessages, 'CRITICAL')).toBe(true)
    expect(hasMessage(fifthMessages, 'edit_file')).toBe(true)
  })

  it('analysis_report: gets write_file nudge after DISCOVER_LIMIT', async () => {
    const readCall = createToolCall('read_file', { file_path: 'src/foo.ts' })
    const searchCall = createToolCall('search_text', { query: 'unused' })
    const readCall2 = createToolCall('read_file', { file_path: 'src/bar.ts' })

    vi.mocked(callLLMStreaming)
      .mockResolvedValueOnce(createResponse({ content: 'reading', toolCalls: [readCall] }))
      .mockResolvedValueOnce(createResponse({ content: 'searching', toolCalls: [searchCall] }))
      .mockResolvedValueOnce(createResponse({ content: 'more reading', toolCalls: [readCall2] }))
      .mockResolvedValue(createResponse({ content: 'text only' }))

    vi.mocked(executeToolCall).mockResolvedValue({ result: '{"ok": true}', error: false })

    await runQueryEngine({
      goal: 'Analyze the workspace and write a report',
      workspacePath,
      primitives,
      terminal,
      config: createConfig({ maxTurns: 12, maxTokenBudget: 250 }),
    })

    const calls = vi.mocked(callLLMStreaming).mock.calls
    // DISCOVER_LIMIT for 12 turns = min(4, 3) = 3, so after turn 3
    const fourthMessages = calls[3]?.[0].messages as QueryMessage[]
    expect(hasMessage(fourthMessages, 'write_file')).toBe(true)
    expect(hasMessage(fourthMessages, 'report')).toBe(true)
  })

  // ─── Post-tool finalization nudge ───

  it('existing_file_edit: gets finalization nudge after edit+readback when still calling tools', async () => {
    // Agent edits at T1, reads back at T2 → canFinalize=true
    // Then keeps calling bash at T3 → should get finalization nudge
    const editCall = createToolCall('edit_file', { file_path: 'src/foo.ts', old_text: 'a', new_text: 'b' })
    const readCall = createToolCall('read_file', { file_path: 'src/foo.ts' }, 'tc-read')
    const bashCall = createToolCall('bash', { command: 'pnpm test' }, 'tc-bash')
    const readCall2 = createToolCall('read_file', { file_path: 'src/bar.ts' }, 'tc-read2')

    vi.mocked(callLLMStreaming)
      .mockResolvedValueOnce(createResponse({ content: 'editing', toolCalls: [editCall] }))
      .mockResolvedValueOnce(createResponse({ content: 'reading back', toolCalls: [readCall] }))
      .mockResolvedValueOnce(createResponse({ content: 'verifying', toolCalls: [bashCall] }))
      .mockResolvedValueOnce(createResponse({ content: 'more', toolCalls: [readCall2] }))
      .mockResolvedValue(createResponse({ content: 'I am done' }))

    vi.mocked(executeToolCall).mockResolvedValue({ result: '{"ok": true}', error: false })

    await runQueryEngine({
      goal: 'Fix the type error in src/foo.ts',
      workspacePath,
      primitives,
      terminal,
      config: createConfig({ maxTurns: 8, maxTokenBudget: 300 }),
    })

    const calls = vi.mocked(callLLMStreaming).mock.calls
    // After T3 (bash, 1 turn after edit without new edits) → finalization nudge
    const fourthMessages = calls[3]?.[0].messages as QueryMessage[]
    expect(hasMessage(fourthMessages, 'core task is COMPLETE')).toBe(true)
  })

  // ─── Doc-task NO-OP recovery nudge ───

  it('jSDoc task: NO-OP edit triggers recovery nudge with undocumentedExports guidance', async () => {
    // Agent tries to edit a symbol that already has JSDoc → gets NO-OP
    // Engine should inject a recovery nudge telling it to pick a different symbol
    const editCall = createToolCall('edit_file', { file_path: 'src/foo.ts', old_text: 'function foo', new_text: '/** JSDoc */\nfunction foo' })
    const readCall = createToolCall('read_file', { file_path: 'src/bar.ts' }, 'tc-read')
    const editCall2 = createToolCall('edit_file', { file_path: 'src/bar.ts', old_text: 'function bar', new_text: '/** JSDoc */\nfunction bar' }, 'tc-edit2')

    vi.mocked(callLLMStreaming)
      .mockResolvedValueOnce(createResponse({ content: 'adding jsdoc', toolCalls: [editCall] }))
      .mockResolvedValueOnce(createResponse({ content: 'trying another file', toolCalls: [readCall] }))
      .mockResolvedValueOnce(createResponse({ content: 'editing bar', toolCalls: [editCall2] }))
      .mockResolvedValue(createResponse({ content: 'done' }))

    // First edit returns NO-OP, second succeeds
    vi.mocked(executeToolCall)
      .mockResolvedValueOnce({ result: '{"error": "EDIT NO-OP: old_text was found but new_text is identical"}', error: false })
      .mockResolvedValue({ result: '{"success": true}', error: false })

    await runQueryEngine({
      goal: 'Add JSDoc documentation to the exported composable in packages/ui',
      workspacePath,
      primitives,
      terminal,
      config: createConfig({ maxTurns: 8, maxTokenBudget: 300 }),
    })

    const calls = vi.mocked(callLLMStreaming).mock.calls
    // After the NO-OP edit (T1), the next LLM call (T2) should include the recovery nudge
    const secondMessages = calls[1]?.[0].messages as QueryMessage[]
    expect(hasMessage(secondMessages, 'undocumentedExports')).toBe(true)
    expect(hasMessage(secondMessages, 'DIFFERENT symbol')).toBe(true)
  })

  it('non-doc task: NO-OP edit does NOT trigger doc-specific recovery nudge', async () => {
    const editCall = createToolCall('edit_file', { file_path: 'src/foo.ts', old_text: 'a', new_text: 'b' })

    vi.mocked(callLLMStreaming)
      .mockResolvedValueOnce(createResponse({ content: 'fixing bug', toolCalls: [editCall] }))
      .mockResolvedValue(createResponse({ content: 'done' }))

    vi.mocked(executeToolCall)
      .mockResolvedValueOnce({ result: '{"error": "EDIT NO-OP: identical"}', error: false })

    await runQueryEngine({
      goal: 'Fix the type error in src/foo.ts',
      workspacePath,
      primitives,
      terminal,
      config: createConfig({ maxTurns: 4, maxTokenBudget: 200 }),
    })

    const calls = vi.mocked(callLLMStreaming).mock.calls
    // Should NOT get the doc-specific nudge
    const secondMessages = calls[1]?.[0].messages as QueryMessage[]
    expect(hasMessage(secondMessages, 'undocumentedExports')).toBe(false)
  })
})
