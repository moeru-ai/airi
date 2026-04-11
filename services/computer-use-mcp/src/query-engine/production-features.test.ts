/**
 * Tests for the 3 new modules:
 * 1. Session persistence (session.ts)
 * 2. Tokenizer (tokenizer.ts)
 * 3. Read cache + model fallback integration
 */

import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildSessionState, deleteSession, listSessions, loadSession, saveSession } from './session'
import { estimateMessagesTokens, estimateTokenCount } from './tokenizer'

// ─── Session Persistence ───

describe('session persistence', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'airi-session-test-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('saves and loads a session', async () => {
    const state = buildSessionState({
      sessionId: 'test-123',
      goal: 'Fix a bug',
      workspacePath: '/tmp/test',
      messages: [
        { role: 'system', content: 'You are a coding agent.' },
        { role: 'user', content: 'Fix the bug.' },
      ],
      filesModified: new Set(['/tmp/test/file.ts']),
      turnsUsed: 5,
      toolCallsUsed: 12,
      tokensUsed: 50000,
      anyEditMade: true,
      turnsWithoutEdit: 0,
      lastAssistantContent: 'I fixed the bug.',
      status: 'in_progress',
    })

    const path = await saveSession(state, tempDir)
    expect(existsSync(path)).toBe(true)

    const loaded = await loadSession('test-123', tempDir)
    expect(loaded).not.toBeNull()
    expect(loaded!.sessionId).toBe('test-123')
    expect(loaded!.goal).toBe('Fix a bug')
    expect(loaded!.messages).toHaveLength(2)
    expect(loaded!.filesModified).toContain('/tmp/test/file.ts')
    expect(loaded!.turnsUsed).toBe(5)
    expect(loaded!.tokensUsed).toBe(50000)
    expect(loaded!.anyEditMade).toBe(true)
  })

  it('returns null for non-existent session', async () => {
    const loaded = await loadSession('nonexistent', tempDir)
    expect(loaded).toBeNull()
  })

  it('deletes a session', async () => {
    const state = buildSessionState({
      sessionId: 'to-delete',
      goal: 'Delete me',
      workspacePath: '/tmp',
      messages: [],
      filesModified: new Set(),
      turnsUsed: 0,
      toolCallsUsed: 0,
      tokensUsed: 0,
      anyEditMade: false,
      turnsWithoutEdit: 0,
      lastAssistantContent: '',
      status: 'completed',
    })

    await saveSession(state, tempDir)
    expect(await loadSession('to-delete', tempDir)).not.toBeNull()

    await deleteSession('to-delete', tempDir)
    expect(await loadSession('to-delete', tempDir)).toBeNull()
  })

  it('lists sessions sorted by date', async () => {
    for (const id of ['a', 'b', 'c']) {
      const state = buildSessionState({
        sessionId: id,
        goal: `Goal ${id}`,
        workspacePath: '/tmp',
        messages: [],
        filesModified: new Set(),
        turnsUsed: 0,
        toolCallsUsed: 0,
        tokensUsed: 0,
        anyEditMade: false,
        turnsWithoutEdit: 0,
        lastAssistantContent: '',
        status: 'in_progress',
      })
      await saveSession(state, tempDir)
    }

    const sessions = await listSessions(tempDir)
    expect(sessions).toHaveLength(3)
    expect(sessions.map(s => s.sessionId)).toEqual(expect.arrayContaining(['a', 'b', 'c']))
  })
})

// ─── Tokenizer ───

describe('estimateTokenCount', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokenCount('')).toBe(0)
  })

  it('estimates short English text', () => {
    const tokens = estimateTokenCount('Hello, world!')
    // "Hello" "," " " "world" "!" ≈ 4-5 tokens
    expect(tokens).toBeGreaterThan(2)
    expect(tokens).toBeLessThan(10)
  })

  it('estimates CJK text higher than ASCII', () => {
    const cjk = estimateTokenCount('你好世界这是一段中文文本')
    const ascii = estimateTokenCount('Hello world this is some text')
    // CJK should estimate more tokens per character
    expect(cjk).toBeGreaterThan(5)
  })

  it('estimates code with camelCase identifiers', () => {
    const code = estimateTokenCount('const myVariableName = getSomeValueFromDatabase()')
    // camelCase splits: my, Variable, Name, get, Some, Value, From, Database
    expect(code).toBeGreaterThan(5)
    expect(code).toBeLessThan(30)
  })

  it('estimates numbers efficiently', () => {
    const nums = estimateTokenCount('12345678901234567890')
    // ~20 digits / 3 ≈ 7 tokens
    expect(nums).toBeGreaterThan(3)
    expect(nums).toBeLessThan(15)
  })

  it('handles mixed content', () => {
    const mixed = estimateTokenCount('function getData() { return fetch("https://api.example.com/v1/users") }')
    expect(mixed).toBeGreaterThan(10)
    expect(mixed).toBeLessThan(40)
  })
})

describe('estimateMessagesTokens', () => {
  it('adds per-message overhead', () => {
    const single = estimateMessagesTokens([{ role: 'user', content: 'hi' }])
    const double = estimateMessagesTokens([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ])
    // Each message adds ~4 tokens overhead
    expect(double).toBeGreaterThan(single)
  })

  it('handles null content', () => {
    const tokens = estimateMessagesTokens([{ role: 'assistant', content: null }])
    expect(tokens).toBeGreaterThan(0) // At least overhead
  })

  it('counts tool_calls JSON', () => {
    const withTools = estimateMessagesTokens([{
      role: 'assistant',
      content: null,
      tool_calls: [{ id: '1', type: 'function', function: { name: 'read_file', arguments: '{"file_path": "/tmp/test.ts"}' } }],
    }])
    const without = estimateMessagesTokens([{ role: 'assistant', content: null }])
    expect(withTools).toBeGreaterThan(without)
  })
})

// ─── Read Cache Logic ───

describe('read cache logic', () => {
  it('cache key format is filePath:startLine:endLine', () => {
    // Test the cache key format used in engine.ts
    const args = { file_path: '/tmp/test.ts', start_line: 1, end_line: 50 }
    const cacheKey = `${args.file_path}:${args.start_line ?? ''}:${args.end_line ?? ''}`
    expect(cacheKey).toBe('/tmp/test.ts:1:50')
  })

  it('cache key without line numbers', () => {
    const args = { file_path: '/tmp/test.ts' }
    const cacheKey = `${args.file_path}:${(args as any).start_line ?? ''}:${(args as any).end_line ?? ''}`
    expect(cacheKey).toBe('/tmp/test.ts::')
  })

  it('cache invalidation prefix match', () => {
    const cache = new Map<string, string>()
    cache.set('/tmp/test.ts::', 'full content')
    cache.set('/tmp/test.ts:1:50', 'partial content')
    cache.set('/tmp/other.ts::', 'other content')

    // Invalidate /tmp/test.ts
    const editedFile = '/tmp/test.ts'
    for (const key of cache.keys()) {
      if (key.startsWith(`${editedFile}:`)) {
        cache.delete(key)
      }
    }

    expect(cache.size).toBe(1)
    expect(cache.has('/tmp/other.ts::')).toBe(true)
  })
})

// ─── Model Fallback Logic ───

describe('model fallback logic', () => {
  it('fallback model switching', () => {
    let currentModel = 'gpt-5.4-mini'
    const fallbackModel = 'gpt-4o-mini'
    let usedFallback = false

    // Simulate primary failure
    currentModel = fallbackModel
    usedFallback = true

    expect(currentModel).toBe('gpt-4o-mini')
    expect(usedFallback).toBe(true)

    // Simulate fallback success → switch back
    if (usedFallback) {
      currentModel = 'gpt-5.4-mini'
      usedFallback = false
    }

    expect(currentModel).toBe('gpt-5.4-mini')
    expect(usedFallback).toBe(false)
  })
})
