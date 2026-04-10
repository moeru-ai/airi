/**
 * Real-World Production Validation
 *
 * Tests the AIRI coding agent against real open-source repositories
 * with realistic tasks that a developer would actually ask.
 *
 * IMPORTANT: All scenarios run in ISOLATED workspaces under /tmp.
 * The AIRI monorepo scenarios use a shallow git clone of the local repo
 * to avoid polluting the working tree.
 *
 * Usage:
 *   AIRI_AGENT_API_KEY=<key> AIRI_AGENT_BASE_URL=<url> AIRI_AGENT_MODEL=gpt-5.4-mini \
 *     pnpm exec tsx src/query-engine/e2e-realworld.ts
 */

import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { CodingPrimitives } from '../coding/primitives'
import { resolveConfig, runQueryEngine } from './engine'

// ─── Constants ───

const TEST_ROOT = '/tmp/airi-realworld-tests'

/**
 * Resolve the AIRI monorepo root by walking up from this file to find .git.
 * Falls back to cwd() if not found.
 */
function findAiriRoot(): string {
  // NOTICE: tsx supports import.meta.dirname in Node 21+
  // For older Node, fall back to process.cwd()
  const startDir = typeof import.meta.dirname === 'string'
    ? import.meta.dirname
    : process.cwd()
  let dir = startDir
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, '.git'))) return dir
    dir = join(dir, '..')
  }
  return process.cwd()
}

// ─── Terminal Runner ───

function createTerminal(workspacePath: string) {
  return {
    describe: () => ({ kind: 'local-shell-runner' as const, notes: ['realworld-test'] }),
    execute: async (input: { command: string; cwd?: string; timeoutMs?: number }) => {
      try {
        const stdout = execSync(input.command, {
          cwd: input.cwd ?? workspacePath,
          timeout: input.timeoutMs ?? 60_000,
          encoding: 'utf-8',
          maxBuffer: 8 * 1024 * 1024,
        })
        return { command: input.command, stdout: stdout ?? '', stderr: '', exitCode: 0, effectiveCwd: input.cwd ?? workspacePath, durationMs: 0, timedOut: false }
      }
      catch (err: any) {
        return { command: input.command, stdout: err.stdout ?? '', stderr: err.stderr ?? '', exitCode: err.status ?? 1, effectiveCwd: input.cwd ?? workspacePath, durationMs: 0, timedOut: false }
      }
    },
    getState: () => ({ effectiveCwd: workspacePath }),
    resetState: (_reason?: string) => ({ effectiveCwd: workspacePath }),
  }
}

// ─── Test Scenario ───

interface RealWorldScenario {
  name: string
  /** git clone URL, or 'local:<path>' to shallow-clone a local repo */
  repo: string
  branch?: string
  /** Absolute path to use as workspace (under TEST_ROOT) */
  workDir: string
  goal: string
  maxTurns: number
  maxTokenBudget: number
  validate: (ws: string) => { passed: boolean; details: string }
}

// ─── Scenario Builder ───

function buildScenarios(airiRoot: string): RealWorldScenario[] {
  return [
    // Scenario 1: AIRI monorepo (ISOLATED copy) — edit a composable
    {
      name: 'AIRI: Add missing JSDoc to a Vue composable',
      repo: `local:${airiRoot}`,
      workDir: join(TEST_ROOT, 'airi-s1'),
      goal: '', // set dynamically
      maxTurns: 10,
      maxTokenBudget: 80_000,
      validate: (ws) => {
        try {
          const diff = execSync('git diff --name-only', { cwd: ws, encoding: 'utf-8' })
          const untracked = execSync('git ls-files --others --exclude-standard', { cwd: ws, encoding: 'utf-8' })
          const allChanged = [...diff.split('\n'), ...untracked.split('\n')]
            .filter(f => f.trim().length > 0 && (f.includes('packages/ui') || f.includes('.ts') || f.includes('.vue')))
          if (allChanged.length > 0) {
            return { passed: true, details: `Changed: ${allChanged.join(', ')}` }
          }
          return { passed: false, details: 'No files were changed' }
        }
        catch {
          return { passed: false, details: 'git check failed' }
        }
      },
    },

    // Scenario 2: AIRI monorepo (ISOLATED copy) — analysis task (read-only)
    {
      name: 'AIRI: Find unused exports in stage-ui',
      repo: `local:${airiRoot}`,
      workDir: join(TEST_ROOT, 'airi-s2'),
      goal: '', // set dynamically
      maxTurns: 12,
      maxTokenBudget: 100_000,
      validate: (ws) => {
        const reportPath = join(ws, 'analysis-report.md')
        if (!existsSync(reportPath)) {
          return { passed: false, details: 'Analysis report not created' }
        }
        const content = readFileSync(reportPath, 'utf-8')
        const hasExports = content.toLowerCase().includes('export')
        const hasFile = content.includes('.ts') || content.includes('.vue')
        const isSubstantial = content.length > 200
        return {
          passed: isSubstantial && (hasExports || hasFile),
          details: `Report: ${content.length} chars, hasExports=${hasExports}, hasFile=${hasFile}`,
        }
      },
    },

    // Scenario 3: Zod — popular TypeScript validation library
    {
      name: 'Zod: Add a utility type helper',
      repo: 'https://github.com/colinhacks/zod.git',
      branch: 'main',
      workDir: join(TEST_ROOT, 'zod'),
      goal: '', // set dynamically
      maxTurns: 10,
      maxTokenBudget: 80_000,
      validate: (ws) => {
        try {
          const diff = execSync('git diff --stat', { cwd: ws, encoding: 'utf-8' })
          const untracked = execSync('git ls-files --others --exclude-standard', { cwd: ws, encoding: 'utf-8' })
          const hasChanges = diff.trim().length > 0 || untracked.trim().length > 0
          const details = diff.trim()
            ? diff.trim().split('\n').slice(-1)[0]
            : (untracked.trim() ? `New files: ${untracked.trim().split('\n').join(', ')}` : 'no changes')
          return { passed: hasChanges, details: details || 'no changes' }
        }
        catch {
          return { passed: false, details: 'git check failed' }
        }
      },
    },

    // Scenario 4: httpie (Python CLI) — cross-language test
    {
      name: 'HTTPie: Fix a docstring',
      repo: 'https://github.com/httpie/cli.git',
      branch: 'master',
      workDir: join(TEST_ROOT, 'httpie'),
      goal: '', // set dynamically
      maxTurns: 8,
      maxTokenBudget: 60_000,
      validate: (ws) => {
        try {
          const diff = execSync('git diff --stat', { cwd: ws, encoding: 'utf-8' })
          const untracked = execSync('git ls-files --others --exclude-standard', { cwd: ws, encoding: 'utf-8' })
          const hasChanges = diff.trim().length > 0 || untracked.trim().length > 0
          const details = diff.trim()
            ? diff.trim().split('\n').slice(-1)[0]
            : (untracked.trim() ? `New files: ${untracked.trim().split('\n').join(', ')}` : 'no changes')
          return { passed: hasChanges, details: details || 'no changes' }
        }
        catch {
          return { passed: false, details: 'git check failed' }
        }
      },
    },
  ]
}

// ─── Runner ───

interface ScenarioResult {
  name: string
  passed: boolean
  status: string
  turns: number
  tokens: number
  durationS: number
  toolsUsed: string[]
  filesModified: string[]
  validationDetails: string
  error?: string
}

/**
 * Prepare workspace: clone or shallow-copy as needed.
 * Returns the resolved workspace path.
 */
function prepareWorkspace(scenario: RealWorldScenario): string {
  const ws = scenario.workDir

  if (scenario.repo.startsWith('local:')) {
    // Shallow-clone local repo to isolated directory
    const localPath = scenario.repo.slice('local:'.length)
    if (existsSync(join(ws, '.git'))) {
      // Already cloned — just reset
      execSync('git checkout . && git clean -fd', { cwd: ws, encoding: 'utf-8', timeout: 30_000 })
    }
    else {
      // NOTICE: Use git clone --depth 1 --no-hardlinks to create a truly
      // isolated copy. --no-hardlinks ensures the clone is independent.
      mkdirSync(ws, { recursive: true })
      execSync(`git clone --depth 1 --no-hardlinks file://${localPath} ${ws}`, {
        encoding: 'utf-8',
        timeout: 120_000,
      })
    }
    return ws
  }

  if (scenario.repo && !existsSync(join(ws, '.git'))) {
    console.log(`  📦 Cloning ${scenario.repo}...`)
    const branchFlag = scenario.branch ? `--branch ${scenario.branch}` : ''
    execSync(`git clone --depth 1 ${branchFlag} ${scenario.repo} ${ws}`, {
      encoding: 'utf-8',
      timeout: 120_000,
    })
  }
  else if (scenario.repo && existsSync(join(ws, '.git'))) {
    execSync('git checkout . && git clean -fd', { cwd: ws, encoding: 'utf-8', timeout: 30_000 })
  }

  return ws
}

async function runScenario(scenario: RealWorldScenario): Promise<ScenarioResult> {
  const workspacePath = prepareWorkspace(scenario)

  // Set dynamic goals based on scenario
  let goal = scenario.goal
  if (scenario.name.includes('JSDoc') && scenario.name.includes('AIRI')) {
    goal = `You are working in a TypeScript monorepo at ${workspacePath}.

TASK: Find and document a composable function in packages/ui.

1. Search for composable files in packages/ui/src/ (look for useTheme, useDark, or any exported composable)
2. Read the source code of the composable you find
3. Add JSDoc comments to the exported function explaining what it does, its parameters, return value, and a usage example
4. Verify your changes by reading the file back

Use absolute paths. The workspace root is ${workspacePath}.
Be precise. Only modify the composable file, nothing else.`
  }
  else if (scenario.name.includes('unused exports')) {
    goal = `You are working in a TypeScript monorepo at ${workspacePath}.

TASK: Analyze packages/stage-ui/src/stores/ to find one store that has unused exports.

1. List files in packages/stage-ui/src/stores/
2. Pick one store file and read it
3. Search the rest of the codebase for imports of its exports
4. Write a brief analysis to ${workspacePath}/analysis-report.md listing:
   - File analyzed
   - Exports found
   - Which exports are imported elsewhere
   - Which exports appear unused

This is analysis only — do NOT modify any source files except creating the report.
Use absolute paths.`
  }
  else if (scenario.name.startsWith('Zod:')) {
    goal = `You are working in the Zod repository at ${workspacePath}.

TASK: Read the main source entry point and add a JSDoc comment to one undocumented exported type or function.

1. List files in the src/ directory
2. Read the main entry file (likely src/index.ts or similar)
3. Find an exported type or function that lacks JSDoc
4. Add a clear JSDoc comment explaining what it does using edit_file
5. Read the file back to verify your edit was applied correctly

Use absolute paths. Be precise. Only modify one file, only add documentation.`
  }
  else if (scenario.name.startsWith('HTTPie:')) {
    goal = `You are working in the HTTPie CLI repository at ${workspacePath}.

TASK: Find an undocumented or poorly documented Python function and improve its docstring.

1. List files in the httpie/ directory
2. Pick a Python file and read it
3. Find a function without a docstring or with a minimal one
4. Add or improve the docstring following Google Python Style Guide format using edit_file
5. Read the file back to verify your edit

Use absolute paths. Be precise. Only modify one file.`
  }

  const runtime = {
    config: { workspacePath },
    cwd: workspacePath,
    getWorkspacePath: () => workspacePath,
  } as any
  const primitives = new CodingPrimitives(runtime)
  const terminal = createTerminal(workspacePath)
  const config = resolveConfig({
    maxTurns: scenario.maxTurns,
    maxToolCalls: 30,
    maxTokenBudget: scenario.maxTokenBudget,
  })

  const toolsUsed: string[] = []
  const startedAt = Date.now()

  try {
    const result = await runQueryEngine({
      goal,
      workspacePath,
      primitives,
      terminal,
      config,
      onProgress: (event) => {
        if (event.toolName && !toolsUsed.includes(event.toolName)) {
          toolsUsed.push(event.toolName)
        }
        const icon = event.phase === 'calling_llm' ? '🤖' : event.phase === 'executing_tools' ? '🔧' : '📊'
        const msg = event.message ? ` | ${event.message.slice(0, 60)}` : ''
        process.stdout.write(`    ${icon} T${event.turn} ${event.toolName ?? event.phase}${msg}\n`)
      },
    })

    const durationS = Math.round((Date.now() - startedAt) / 100) / 10
    const validation = scenario.validate(workspacePath)

    return {
      name: scenario.name,
      passed: validation.passed,
      status: result.status,
      turns: result.turnsUsed,
      tokens: result.tokensUsed,
      durationS,
      toolsUsed,
      filesModified: result.filesModified,
      validationDetails: validation.details,
    }
  }
  catch (err: any) {
    return {
      name: scenario.name,
      passed: false,
      status: 'error',
      turns: 0,
      tokens: 0,
      durationS: Math.round((Date.now() - startedAt) / 100) / 10,
      toolsUsed,
      filesModified: [],
      validationDetails: '',
      error: err.message?.slice(0, 200),
    }
  }
}

// ─── Main ───

async function main() {
  const airiRoot = findAiriRoot()

  console.log('╔═══════════════════════════════════════════════════════════╗')
  console.log('║     AIRI REAL-WORLD PRODUCTION VALIDATION                ║')
  console.log('║     Model: ' + (process.env.AIRI_AGENT_MODEL ?? 'gpt-5.4-mini').padEnd(46) + '║')
  console.log('╚═══════════════════════════════════════════════════════════╝')
  console.log('')
  console.log(`  AIRI root: ${airiRoot}`)
  console.log(`  Test root: ${TEST_ROOT}`)
  console.log(`  NOTE: All scenarios run in ISOLATED workspaces under ${TEST_ROOT}`)
  console.log('')

  mkdirSync(TEST_ROOT, { recursive: true })

  const scenarios = buildScenarios(airiRoot)
  const results: ScenarioResult[] = []

  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i]
    console.log(`┌─── Scenario ${i + 1}/${scenarios.length}: ${scenario.name} ───`)
    console.log(`│  Workspace: ${scenario.workDir}`)
    console.log(`│  Budget: ${scenario.maxTurns}T / ${(scenario.maxTokenBudget / 1000).toFixed(0)}K tokens`)

    const result = await runScenario(scenario)
    results.push(result)

    const icon = result.passed ? '✅' : '❌'
    console.log(`│  ${icon} Status: ${result.status}`)
    console.log(`│    Turns: ${result.turns} | Tokens: ${Math.round(result.tokens / 1000)}K | Duration: ${result.durationS}s`)
    console.log(`│    Tools: ${result.toolsUsed.join(', ')}`)
    console.log(`│    Files: ${result.filesModified.join(', ') || 'none'}`)
    console.log(`│    Validation: ${result.validationDetails}`)
    if (result.error) console.log(`│    Error: ${result.error}`)
    console.log('└───')
    console.log('')
  }

  // Summary
  console.log('╔═══════════════════════════════════════════════════════════╗')
  console.log('║              REAL-WORLD VALIDATION SCORECARD             ║')
  console.log('╚═══════════════════════════════════════════════════════════╝')
  console.log('')

  const passed = results.filter(r => r.passed).length
  const total = results.length
  const totalTokens = results.reduce((s, r) => s + (r.tokens || 0), 0)
  const totalTime = results.reduce((s, r) => s + r.durationS, 0)

  for (const r of results) {
    const icon = r.passed ? '✅' : '❌'
    console.log(`  ${icon} ${r.name}`)
    console.log(`     ${r.turns}T | ${Math.round(r.tokens / 1000)}K tokens | ${r.durationS}s | ${r.status}`)
    console.log(`     ${r.validationDetails}`)
    if (r.error) console.log(`     ⚠️ ${r.error}`)
    console.log('')
  }

  console.log(`  Pass rate: ${passed}/${total} (${Math.round(passed / total * 100)}%)`)
  console.log(`  Total tokens: ${Math.round(totalTokens / 1000)}K`)
  console.log(`  Total time: ${totalTime.toFixed(1)}s`)
  console.log('')

  if (passed === total) {
    console.log('  🟢 ALL SCENARIOS PASSED')
  }
  else if (passed >= total * 0.75) {
    console.log('  🟡 MOSTLY PASSED — Some scenarios need attention')
  }
  else {
    console.log('  🔴 BELOW THRESHOLD')
  }

  // Save results
  const reportPath = join(TEST_ROOT, 'validation-report.json')
  writeFileSync(reportPath, JSON.stringify({ results, summary: { passed, total, totalTokens, totalTime } }, null, 2))
  console.log(`\n  Results saved to: ${reportPath}`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
