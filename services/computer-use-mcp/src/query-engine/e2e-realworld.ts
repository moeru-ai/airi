/**
 * Real-World Production Validation
 *
 * Tests the AIRI coding agent against real open-source repositories
 * with realistic tasks that a developer would actually ask.
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
    resetState: (reason?: string) => ({ effectiveCwd: workspacePath }),
  }
}

// ─── Test Scenario ───

interface RealWorldScenario {
  name: string
  repo: string // git clone URL
  branch?: string
  workDir: string // subdirectory within /tmp/airi-realworld-tests/
  goal: string
  maxTurns: number
  maxTokenBudget: number
  validate: (ws: string) => { passed: boolean; details: string }
}

// ─── Scenarios ───

const scenarios: RealWorldScenario[] = [
  // Scenario 1: AIRI monorepo — find a real issue in packages/ui
  {
    name: 'AIRI: Add missing JSDoc to a Vue composable',
    repo: '', // use local copy
    workDir: '/Users/liuziheng/airi',
    goal: `You are working in the AIRI monorepo at /Users/liuziheng/airi.

TASK: Find and document the \`useTheme\` or \`useDark\` composable in packages/ui.

1. First, search for theme/dark-related composables in packages/ui/src/
2. Read the source code of the composable you find
3. Add JSDoc comments to the exported function explaining:
   - What it does
   - Parameters and return value
   - Usage example
4. Verify your changes don't break the file by reading it back

Use absolute paths. The workspace root is /Users/liuziheng/airi.
Be precise. Only modify the composable file, nothing else.`,
    maxTurns: 10,
    maxTokenBudget: 80_000,
    validate: (ws) => {
      // Check if any file in packages/ui was modified or created
      try {
        const diff = execSync('git diff --name-only', { cwd: ws, encoding: 'utf-8' })
        const untracked = execSync('git ls-files --others --exclude-standard', { cwd: ws, encoding: 'utf-8' })
        const allChanged = [...diff.split('\n'), ...untracked.split('\n')].filter(f => f.includes('packages/ui'))
        if (allChanged.length > 0) {
          return { passed: true, details: `Changed: ${allChanged.join(', ')}` }
        }
        return { passed: false, details: 'No files in packages/ui were changed' }
      }
      catch {
        return { passed: false, details: 'git check failed' }
      }
    },
  },

  // Scenario 2: AIRI monorepo — real TypeScript task
  {
    name: 'AIRI: Find unused exports in stage-ui',
    repo: '',
    workDir: '/Users/liuziheng/airi',
    goal: `You are working in the AIRI monorepo at /Users/liuziheng/airi.

TASK: Analyze packages/stage-ui/src/stores/ to find one store that has unused exports.

1. List files in packages/stage-ui/src/stores/
2. Pick one store file and read it
3. Search the rest of the codebase for imports of its exports
4. Write a brief analysis to /tmp/airi-realworld-tests/airi-analysis.md listing:
   - File analyzed
   - Exports found
   - Which exports are imported elsewhere
   - Which exports appear unused

This is analysis only — do NOT modify any source files.
Use absolute paths.`,
    maxTurns: 12,
    maxTokenBudget: 100_000,
    validate: (_ws) => {
      const reportPath = '/tmp/airi-realworld-tests/airi-analysis.md'
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
    workDir: '/tmp/airi-realworld-tests/zod',
    goal: '', // set dynamically after clone
    maxTurns: 10,
    maxTokenBudget: 80_000,
    validate: (ws) => {
      try {
        const diff = execSync('git diff --stat', { cwd: ws, encoding: 'utf-8' })
        const untracked = execSync('git ls-files --others --exclude-standard', { cwd: ws, encoding: 'utf-8' })
        const hasChanges = diff.trim().length > 0 || untracked.trim().length > 0
        const details = diff.trim() ? diff.trim().split('\n').slice(-1)[0] : (untracked.trim() ? `New files: ${untracked.trim().split('\n').join(', ')}` : 'no changes')
        return {
          passed: hasChanges,
          details: details || 'no changes',
        }
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
    workDir: '/tmp/airi-realworld-tests/httpie',
    goal: '', // set dynamically after clone
    maxTurns: 8,
    maxTokenBudget: 60_000,
    validate: (ws) => {
      try {
        const diff = execSync('git diff --stat', { cwd: ws, encoding: 'utf-8' })
        const untracked = execSync('git ls-files --others --exclude-standard', { cwd: ws, encoding: 'utf-8' })
        const hasChanges = diff.trim().length > 0 || untracked.trim().length > 0
        const details = diff.trim() ? diff.trim().split('\n').slice(-1)[0] : (untracked.trim() ? `New files: ${untracked.trim().split('\n').join(', ')}` : 'no changes')
        return {
          passed: hasChanges,
          details: details || 'no changes',
        }
      }
      catch {
        return { passed: false, details: 'git check failed' }
      }
    },
  },
]

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

async function runScenario(scenario: RealWorldScenario): Promise<ScenarioResult> {
  const workspacePath = scenario.workDir

  // Clone if needed
  if (scenario.repo && !existsSync(join(workspacePath, '.git'))) {
    console.log(`  📦 Cloning ${scenario.repo}...`)
    const branchFlag = scenario.branch ? `--branch ${scenario.branch}` : ''
    execSync(`git clone --depth 1 ${branchFlag} ${scenario.repo} ${workspacePath}`, {
      encoding: 'utf-8',
      timeout: 120_000,
    })
  }

  // Set dynamic goals for cloned repos
  let goal = scenario.goal
  if (scenario.name.startsWith('Zod:')) {
    goal = `You are working in the Zod repository at ${workspacePath}.

TASK: Read the main source entry point and add a JSDoc comment to one undocumented exported type or function.

1. List files in the src/ directory
2. Read the main entry file (likely src/index.ts or similar)
3. Find an exported type or function that lacks JSDoc
4. Add a clear JSDoc comment explaining what it does
5. Read the file back to verify your edit was applied correctly

Use absolute paths. Be precise. Only modify one file, only add documentation.`
  }
  else if (scenario.name.startsWith('HTTPie:')) {
    goal = `You are working in the HTTPie CLI repository at ${workspacePath}.

TASK: Find an undocumented or poorly documented Python function and improve its docstring.

1. List files in the httpie/ directory
2. Pick a Python file and read it
3. Find a function without a docstring or with a minimal one
4. Add or improve the docstring following Google Python Style Guide format
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
  console.log('╔═══════════════════════════════════════════════════════════╗')
  console.log('║     AIRI REAL-WORLD PRODUCTION VALIDATION                ║')
  console.log('║     Model: ' + (process.env.AIRI_AGENT_MODEL ?? 'gpt-5.4-mini').padEnd(46) + '║')
  console.log('╚═══════════════════════════════════════════════════════════╝')
  console.log('')

  const results: ScenarioResult[] = []

  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i]
    console.log(`┌─── Scenario ${i + 1}/${scenarios.length}: ${scenario.name} ───`)
    console.log(`│  Workspace: ${scenario.workDir}`)
    console.log(`│  Budget: ${scenario.maxTurns}T / ${(scenario.maxTokenBudget / 1000).toFixed(0)}K tokens`)

    // Reset workspace for non-local repos
    if (scenario.repo && existsSync(join(scenario.workDir, '.git'))) {
      execSync('git checkout .', { cwd: scenario.workDir, encoding: 'utf-8' })
    }

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

    // Reset AIRI workspace after each scenario that uses it
    if (!scenario.repo) {
      execSync('git checkout .', { cwd: scenario.workDir, encoding: 'utf-8' })
    }
  }

  // Summary
  console.log('╔═══════════════════════════════════════════════════════════╗')
  console.log('║              REAL-WORLD VALIDATION SCORECARD             ║')
  console.log('╚═══════════════════════════════════════════════════════════╝')
  console.log('')

  const passed = results.filter(r => r.passed).length
  const total = results.length
  const totalTokens = results.reduce((s, r) => s + r.tokens, 0)
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
    console.log('  🟢 ALL SCENARIOS PASSED — Production validation successful')
  }
  else if (passed >= total * 0.75) {
    console.log('  🟡 MOSTLY PASSED — Some scenarios need attention')
  }
  else {
    console.log('  🔴 BELOW THRESHOLD — Not production-ready')
  }

  // Save results
  const reportPath = '/tmp/airi-realworld-tests/validation-report.json'
  writeFileSync(reportPath, JSON.stringify({ results, summary: { passed, total, totalTokens, totalTime } }, null, 2))
  console.log(`\n  Results saved to: ${reportPath}`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
