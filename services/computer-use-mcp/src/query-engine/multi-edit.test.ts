/**
 * Tests for multi_edit_file and parallel tool execution.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  buildToolRoutes,
  executeToolCall,
  getToolDefinitions,
} from './tool-router'

describe('multi_edit_file', () => {
  let ws: string
  let routes: ReturnType<typeof buildToolRoutes>

  beforeEach(() => {
    ws = join(tmpdir(), `airi-test-multi-edit-${Date.now()}`)
    mkdirSync(ws, { recursive: true })
    const mockPrimitives = {} as any
    const mockTerminal = { execute: async () => ({}) } as any
    routes = buildToolRoutes({ primitives: mockPrimitives, terminal: mockTerminal, workspacePath: ws })
  })

  afterEach(() => {
    rmSync(ws, { recursive: true, force: true })
  })

  it('applies multiple edits to a single file', async () => {
    const filePath = join(ws, 'test.ts')
    writeFileSync(filePath, `const a = 1\nconst b = 2\nconst c = 3\n`)

    const { result, error } = await executeToolCall(routes, 'multi_edit_file', JSON.stringify({
      file_path: filePath,
      edits: [
        { old_text: 'const a = 1', new_text: 'const a = 10' },
        { old_text: 'const c = 3', new_text: 'const c = 30' },
      ],
    }))

    expect(error).toBe(false)
    const parsed = JSON.parse(result)
    expect(parsed.success).toBe(true)
    expect(parsed.editsApplied).toBe(2)
    expect(parsed.editsFailed).toBe(0)

    const content = readFileSync(filePath, 'utf-8')
    expect(content).toBe('const a = 10\nconst b = 2\nconst c = 30\n')
  })

  it('reports partial failures when some edits do not match', async () => {
    const filePath = join(ws, 'test.ts')
    writeFileSync(filePath, `line1\nline2\nline3\n`)

    const { result, error } = await executeToolCall(routes, 'multi_edit_file', JSON.stringify({
      file_path: filePath,
      edits: [
        { old_text: 'line1', new_text: 'LINE_ONE' },
        { old_text: 'NONEXISTENT', new_text: 'replacement' },
        { old_text: 'line3', new_text: 'LINE_THREE' },
      ],
    }))

    expect(error).toBe(false)
    const parsed = JSON.parse(result)
    expect(parsed.success).toBe(true)
    expect(parsed.editsApplied).toBe(2)
    expect(parsed.editsFailed).toBe(1)
    expect(parsed.errors).toHaveLength(1)

    const content = readFileSync(filePath, 'utf-8')
    expect(content).toBe('LINE_ONE\nline2\nLINE_THREE\n')
  })

  it('returns error when no edits match', async () => {
    const filePath = join(ws, 'test.ts')
    writeFileSync(filePath, `hello world\n`)

    const { result, error } = await executeToolCall(routes, 'multi_edit_file', JSON.stringify({
      file_path: filePath,
      edits: [
        { old_text: 'NONEXISTENT', new_text: 'replacement' },
      ],
    }))

    expect(error).toBe(false)
    const parsed = JSON.parse(result)
    expect(parsed.error).toContain('No edits could be applied')

    // File should be unchanged
    expect(readFileSync(filePath, 'utf-8')).toBe('hello world\n')
  })

  it('rejects duplicate matches within a single edit', async () => {
    const filePath = join(ws, 'test.ts')
    writeFileSync(filePath, `x = 1\ny = 2\nx = 1\n`)

    const { result, error } = await executeToolCall(routes, 'multi_edit_file', JSON.stringify({
      file_path: filePath,
      edits: [
        { old_text: 'x = 1', new_text: 'x = 99' },
      ],
    }))

    expect(error).toBe(false)
    const parsed = JSON.parse(result)
    // Should fail because x = 1 appears twice
    expect(parsed.error).toBeDefined()
  })

  it('handles sequential edits where later edits depend on earlier ones', async () => {
    const filePath = join(ws, 'test.ts')
    writeFileSync(filePath, `function add(a, b) {\n  return a + b\n}\n`)

    const { result, error } = await executeToolCall(routes, 'multi_edit_file', JSON.stringify({
      file_path: filePath,
      edits: [
        { old_text: 'function add(a, b)', new_text: 'function add(a: number, b: number): number' },
        { old_text: 'return a + b', new_text: 'return a + b // typed' },
      ],
    }))

    expect(error).toBe(false)
    const parsed = JSON.parse(result)
    expect(parsed.editsApplied).toBe(2)

    const content = readFileSync(filePath, 'utf-8')
    expect(content).toContain('a: number, b: number): number')
    expect(content).toContain('return a + b // typed')
  })
})

describe('edit_file (single)', () => {
  let ws: string
  let routes: ReturnType<typeof buildToolRoutes>

  beforeEach(() => {
    ws = join(tmpdir(), `airi-test-edit-${Date.now()}`)
    mkdirSync(ws, { recursive: true })
    const mockPrimitives = {} as any
    const mockTerminal = { execute: async () => ({}) } as any
    routes = buildToolRoutes({ primitives: mockPrimitives, terminal: mockTerminal, workspacePath: ws })
  })

  afterEach(() => {
    rmSync(ws, { recursive: true, force: true })
  })

  it('replaces text and returns diff', async () => {
    const filePath = join(ws, 'hello.ts')
    writeFileSync(filePath, `const greeting = "hello"\nconsole.log(greeting)\n`)

    const { result, error } = await executeToolCall(routes, 'edit_file', JSON.stringify({
      file_path: filePath,
      old_text: 'const greeting = "hello"',
      new_text: 'const greeting = "hello world"',
    }))

    expect(error).toBe(false)
    const parsed = JSON.parse(result)
    expect(parsed.success).toBe(true)
    expect(parsed.diff).toContain('-const greeting = "hello"')
    expect(parsed.diff).toContain('+const greeting = "hello world"')

    expect(readFileSync(filePath, 'utf-8')).toContain('hello world')
  })

  it('returns error with preview when old_text not found', async () => {
    const filePath = join(ws, 'hello.ts')
    writeFileSync(filePath, `const x = 1\n`)

    const { result, error } = await executeToolCall(routes, 'edit_file', JSON.stringify({
      file_path: filePath,
      old_text: 'NOT_IN_FILE',
      new_text: 'replacement',
    }))

    expect(error).toBe(false)
    const parsed = JSON.parse(result)
    expect(parsed.error).toContain('EDIT FAILED')
    expect(parsed.file_head).toContain('const x = 1')
  })
})

describe('tool definitions', () => {
  it('includes multi_edit_file in tool definitions', () => {
    const defs = getToolDefinitions()
    const names = defs.map(d => d.name)
    expect(names).toContain('edit_file')
    expect(names).toContain('multi_edit_file')
  })

  it('multi_edit_file has correct parameter schema', () => {
    const defs = getToolDefinitions()
    const multiEdit = defs.find(d => d.name === 'multi_edit_file')!
    expect(multiEdit.parameters).toHaveProperty('properties.edits')
    const edits = (multiEdit.parameters as any).properties.edits
    expect(edits.type).toBe('array')
    expect(edits.items.required).toContain('old_text')
    expect(edits.items.required).toContain('new_text')
  })
})
