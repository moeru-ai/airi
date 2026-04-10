/**
 * Tests for bash write guard and layered edit matching.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  buildToolRoutes,
  detectBashWriteViolation,
  executeToolCall,
} from './tool-router'

// ─── Bash Write Guard ───

describe('detectBashWriteViolation', () => {
  // Commands that MUST be blocked
  const BLOCKED = [
    ['sed -i "s/foo/bar/" file.txt', 'sed -i'],
    ['sed -i.bak "s/foo/bar/" file.txt', 'sed -i'],
    ['perl -pi -e "s/foo/bar/" file.txt', 'perl -pi'],
    ['echo "hello" > output.txt', 'echo > file'],
    ['cat template.txt > output.txt', 'cat > file'],
    ['printf "%s" "content" > file.txt', 'printf > file'],
    ['some-command | tee output.txt', 'tee'],
    ['rm file.txt', 'rm'],
    ['rm -rf directory/', 'rm'],
    ['mv old.txt new.txt', 'mv'],
    ['cp source.txt dest.txt', 'cp'],
    ['chmod +x script.sh', 'chmod'],
    ['git add .', 'git write'],
    ['git commit -m "msg"', 'git write'],
    ['git reset --hard', 'git write'],
    ['python -c "open(\'f\',\'w\').write(\'x\')"', 'python write'],
    ['node -e "require(\'fs\').writeFileSync(\'f\',\'x\')"', 'node writeFile'],
    ['truncate -s 0 file.txt', 'truncate'],
    ['patch file.txt < diff.patch', 'patch'],
    ['dd if=/dev/zero of=file bs=1k count=1', 'dd'],
  ] as const

  for (const [cmd, expectedPattern] of BLOCKED) {
    it(`blocks: ${cmd}`, () => {
      const result = detectBashWriteViolation(cmd)
      expect(result).not.toBeNull()
      expect(result!.pattern.toLowerCase()).toContain(expectedPattern.split(' ')[0]!)
    })
  }

  // Commands that MUST be allowed
  const ALLOWED = [
    'ls -la',
    'cat file.txt',
    'head -20 file.txt',
    'tail -f logs.txt',
    'find . -name "*.ts"',
    'grep -r "pattern" .',
    'wc -l file.txt',
    'git status',
    'git log --oneline -5',
    'git diff HEAD',
    'git branch -a',
    'git show HEAD',
    'git stash list',
    'git rev-parse HEAD',
    'npm test',
    'pnpm exec vitest run',
    'tsc --noEmit',
    'node --version',
    'npx vitest run src/test.ts',
    'command 2>/dev/null',
    'echo "result" 2>&1',
  ]

  for (const cmd of ALLOWED) {
    it(`allows: ${cmd}`, () => {
      const result = detectBashWriteViolation(cmd)
      expect(result).toBeNull()
    })
  }
})

describe('bash route blocks write commands', () => {
  let ws: string
  let routes: ReturnType<typeof buildToolRoutes>

  beforeEach(() => {
    ws = join(tmpdir(), `airi-test-bash-guard-${Date.now()}`)
    mkdirSync(ws, { recursive: true })
    const mockPrimitives = {} as any
    const mockTerminal = {
      execute: async () => ({ command: '', stdout: 'ok', stderr: '', exitCode: 0, effectiveCwd: ws, durationMs: 0, timedOut: false }),
    } as any
    routes = buildToolRoutes({ primitives: mockPrimitives, terminal: mockTerminal, workspacePath: ws })
  })

  afterEach(() => {
    rmSync(ws, { recursive: true, force: true })
  })

  it('blocks sed -i through bash route', async () => {
    const { result, error } = await executeToolCall(routes, 'bash', JSON.stringify({
      command: 'sed -i "s/old/new/" file.txt',
    }))

    const parsed = JSON.parse(result)
    expect(parsed.blocked).toBe(true)
    expect(parsed.message).toContain('BLOCKED')
  })

  it('allows git status through bash route', async () => {
    const { result, error } = await executeToolCall(routes, 'bash', JSON.stringify({
      command: 'git status',
    }))

    const parsed = JSON.parse(result)
    expect(parsed.blocked).toBeUndefined()
    expect(parsed.stdout).toBe('ok')
  })

  it('allows npm test through bash route', async () => {
    const { result, error } = await executeToolCall(routes, 'bash', JSON.stringify({
      command: 'npm test',
    }))

    const parsed = JSON.parse(result)
    expect(parsed.blocked).toBeUndefined()
  })
})

// ─── Layered Edit Matching ───

describe('edit_file layered matching', () => {
  let ws: string
  let routes: ReturnType<typeof buildToolRoutes>

  beforeEach(() => {
    ws = join(tmpdir(), `airi-test-layered-${Date.now()}`)
    mkdirSync(ws, { recursive: true })
    const mockPrimitives = {} as any
    const mockTerminal = { execute: async () => ({}) } as any
    routes = buildToolRoutes({ primitives: mockPrimitives, terminal: mockTerminal, workspacePath: ws })
  })

  afterEach(() => {
    rmSync(ws, { recursive: true, force: true })
  })

  it('Layer 1: exact match works', async () => {
    const filePath = join(ws, 'test.ts')
    writeFileSync(filePath, 'const x = 1\nconst y = 2\n')

    const { result } = await executeToolCall(routes, 'edit_file', JSON.stringify({
      file_path: filePath,
      old_text: 'const x = 1',
      new_text: 'const x = 10',
    }))

    const parsed = JSON.parse(result)
    expect(parsed.success).toBe(true)
    expect(parsed.matchType).toBe('exact')
    expect(readFileSync(filePath, 'utf-8')).toContain('const x = 10')
  })

  it('Layer 2: whitespace-normalized match', async () => {
    const filePath = join(ws, 'test.ts')
    writeFileSync(filePath, 'const  x  =  1\nconst y = 2\n')

    const { result } = await executeToolCall(routes, 'edit_file', JSON.stringify({
      file_path: filePath,
      old_text: 'const x = 1',  // Agent used single spaces
      new_text: 'const x = 10',
    }))

    const parsed = JSON.parse(result)
    expect(parsed.success).toBe(true)
    expect(parsed.matchType).toBe('whitespace_normalized')
  })

  it('Layer 3: indent-normalized match', async () => {
    const filePath = join(ws, 'test.ts')
    writeFileSync(filePath, '    function foo() {\n        return 1\n    }\n')

    const { result } = await executeToolCall(routes, 'edit_file', JSON.stringify({
      file_path: filePath,
      old_text: 'function foo() {\nreturn 1\n}',  // Agent stripped indentation
      new_text: '    function foo() {\n        return 42\n    }',
    }))

    const parsed = JSON.parse(result)
    expect(parsed.success).toBe(true)
    expect(parsed.matchType).toBe('indent_normalized')
    expect(readFileSync(filePath, 'utf-8')).toContain('return 42')
  })

  it('Layer 4: fuzzy match returns candidates', async () => {
    const filePath = join(ws, 'test.ts')
    writeFileSync(filePath, 'function calculate(a, b) {\n  return a + b\n}\n\nfunction other() {\n  return 42\n}\n')

    const { result } = await executeToolCall(routes, 'edit_file', JSON.stringify({
      file_path: filePath,
      old_text: 'function calculate(x, y) {\n  return x + y\n}',  // Wrong param names
      new_text: 'function calculate(a: number, b: number) {\n  return a + b\n}',
    }))

    const parsed = JSON.parse(result)
    // Should NOT auto-apply, should return candidates
    expect(parsed.error).toBeDefined()
    expect(parsed.candidates || parsed.bestCandidate).toBeDefined()
  })

  it('Layer 5: total failure shows preview with line numbers', async () => {
    const filePath = join(ws, 'test.ts')
    writeFileSync(filePath, 'completely different content\nnothing matches\n')

    const { result } = await executeToolCall(routes, 'edit_file', JSON.stringify({
      file_path: filePath,
      old_text: 'this text is not in the file at all and has no similarity',
      new_text: 'replacement',
    }))

    const parsed = JSON.parse(result)
    expect(parsed.error).toContain('not found')
    expect(parsed.preview).toBeDefined()
    expect(parsed.hint).toContain('read_file')
  })

  it('reports matchType in successful edits', async () => {
    const filePath = join(ws, 'test.ts')
    writeFileSync(filePath, 'const greeting = "hello"\n')

    const { result } = await executeToolCall(routes, 'edit_file', JSON.stringify({
      file_path: filePath,
      old_text: 'const greeting = "hello"',
      new_text: 'const greeting = "hello world"',
    }))

    const parsed = JSON.parse(result)
    expect(parsed.matchType).toBe('exact')
  })
})
