/**
 * Real-World Validation v2
 *
 * Tests the AIRI coding agent against real open-source repositories.
 * Includes HARD tasks (find+fix bug, edit existing files) not just JSDoc.
 *
 * All scenarios run in ISOLATED workspaces under TEST_ROOT (/tmp/airi-realworld-tests).
 * prepareWorkspace() enforces this constraint — non-compliant paths are rejected.
 *
 * Features:
 * - Multi-run mode: pass --runs N to run N times and report stats
 * - Strict validation: must edit EXISTING tracked files, not create temp files
 * - Mixed difficulty: easy (JSDoc) + hard (fix planted bug, edit existing code)
 *
 * Usage:
 *   AIRI_AGENT_API_KEY=<key> AIRI_AGENT_BASE_URL=<url> AIRI_AGENT_MODEL=gpt-5.4-mini \
 *     pnpm exec tsx src/query-engine/e2e-realworld.ts [--runs 5]
 */

import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { CodingPrimitives } from '../coding/primitives'
import { resolveConfig, runQueryEngine } from './engine'

// ─── Constants ───

const TEST_ROOT = '/tmp/airi-realworld-tests'

function findAiriRoot(): string {
  const startDir = typeof import.meta.dirname === 'string'
    ? import.meta.dirname
    : process.cwd()
  let dir = startDir
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, '.git')))
      return dir
    dir = join(dir, '..')
  }
  return process.cwd()
}

// ─── Terminal Runner ───

function createTerminal(workspacePath: string) {
  return {
    describe: () => ({ kind: 'local-shell-runner' as const, notes: ['realworld-test'] }),
    execute: async (input: { command: string, cwd?: string, timeoutMs?: number }) => {
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

// ─── Scenario Types ───

interface RealWorldScenario {
  name: string
  difficulty: 'easy' | 'medium' | 'hard'
  repo: string
  branch?: string
  workDir: string
  goal: string
  maxTurns: number
  maxTokenBudget: number
  /** Optional setup to run after clone (e.g., plant a bug) */
  setup?: (ws: string) => void
  validate: (ws: string) => { passed: boolean, details: string }
}

interface ScenarioResult {
  name: string
  difficulty: string
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

// ─── Validation Helpers ───

/**
 * Strict validator: requires editing an EXISTING tracked file.
 * New/temp files don't count. This prevents the agent from "cheating"
 * by creating a temp file instead of editing the target.
 */
function requireExistingFileEdit(ws: string, pathFilter?: string): { passed: boolean, details: string } {
  try {
    const diff = execSync('git diff --name-only', { cwd: ws, encoding: 'utf-8' }).trim()
    if (!diff) {
      return { passed: false, details: 'No existing files were modified (git diff empty)' }
    }
    const files = diff.split('\n').filter(f => f.trim().length > 0)
    if (pathFilter) {
      const matching = files.filter(f => f.includes(pathFilter))
      if (matching.length === 0) {
        return { passed: false, details: `Modified ${files.join(', ')} but none match filter '${pathFilter}'` }
      }
      return { passed: true, details: `Edited: ${matching.join(', ')}` }
    }
    return { passed: true, details: `Edited: ${files.join(', ')}` }
  }
  catch {
    return { passed: false, details: 'git diff failed' }
  }
}

/**
 * Verify a planted bug was fixed by checking if a specific string
 * is NO LONGER present in a file.
 */
function requireBugFixed(ws: string, filePath: string, bugPattern: string): { passed: boolean, details: string } {
  try {
    const absPath = join(ws, filePath)
    if (!existsSync(absPath)) {
      return { passed: false, details: `File ${filePath} not found` }
    }
    const content = readFileSync(absPath, 'utf-8')
    if (content.includes(bugPattern)) {
      return { passed: false, details: `Bug pattern '${bugPattern}' still present in ${filePath}` }
    }
    // Also check the file was actually modified
    const editResult = requireExistingFileEdit(ws, filePath)
    if (!editResult.passed) {
      return { passed: false, details: `Bug pattern gone but file not in git diff: ${editResult.details}` }
    }
    return { passed: true, details: `Bug fixed in ${filePath}` }
  }
  catch (err: any) {
    return { passed: false, details: `Error: ${err.message}` }
  }
}

// ─── Scenario Builder ───

function buildScenarios(airiRoot: string): RealWorldScenario[] {
  return [
    // S1 [EASY] AIRI monorepo — JSDoc a composable (baseline)
    {
      name: 'AIRI: Add JSDoc to composable',
      difficulty: 'easy',
      repo: `local:${airiRoot}`,
      workDir: join(TEST_ROOT, 'airi-s1'),
      goal: '',
      maxTurns: 10,
      maxTokenBudget: 80_000,
      validate: ws => requireExistingFileEdit(ws, 'packages/ui'),
    },

    // S2 [EASY] AIRI monorepo — analysis task (read-only + write report)
    {
      name: 'AIRI: Find unused exports',
      difficulty: 'easy',
      repo: `local:${airiRoot}`,
      workDir: join(TEST_ROOT, 'airi-s2'),
      goal: '',
      maxTurns: 12,
      maxTokenBudget: 100_000,
      validate: (ws) => {
        const reportPath = join(ws, 'analysis-report.md')
        if (!existsSync(reportPath)) {
          return { passed: false, details: 'Report not created' }
        }
        const content = readFileSync(reportPath, 'utf-8')
        const ok = content.length > 200
          && (content.toLowerCase().includes('export') || content.includes('.ts'))
        return { passed: ok, details: `Report: ${content.length} chars` }
      },
    },

    // S3 [MEDIUM] AIRI monorepo — find and fix a planted bug
    {
      name: 'AIRI: Fix planted type bug',
      difficulty: 'medium',
      repo: `local:${airiRoot}`,
      workDir: join(TEST_ROOT, 'airi-s3'),
      goal: '',
      maxTurns: 12,
      maxTokenBudget: 100_000,
      setup: (ws) => {
        // Plant a bug: introduce a typo in a real file
        // We'll add a broken import to packages/ui/src/index.ts
        const targetFile = join(ws, 'packages/ui/src/index.ts')
        if (existsSync(targetFile)) {
          const content = readFileSync(targetFile, 'utf-8')
          // Add a broken re-export at the top
          const buggy = `// AIRI-TEST-BUG: This line has a deliberate typo causing a build error\nexport { useThm } from './composables/use-theme'\n${content}`
          writeFileSync(targetFile, buggy)
        }
      },
      validate: ws => requireBugFixed(
        ws,
        'packages/ui/src/index.ts',
        'useThm', // the typo — should be fixed to useTheme or removed
      ),
    },

    // S4 [MEDIUM] HTTPie — must edit an EXISTING .py file (strict)
    {
      name: 'HTTPie: Improve existing docstring',
      difficulty: 'medium',
      repo: 'https://github.com/httpie/cli.git',
      branch: 'master',
      workDir: join(TEST_ROOT, 'httpie'),
      goal: '',
      maxTurns: 10,
      maxTokenBudget: 80_000,
      validate: (ws) => {
        // STRICT: must have edited an existing .py file, not created a temp
        const result = requireExistingFileEdit(ws, '.py')
        if (!result.passed)
          return result
        // Extra check: the diff should show added docstring content
        try {
          const diff = execSync('git diff', { cwd: ws, encoding: 'utf-8' })
          const hasDocstring = diff.includes('"""') || diff.includes('\'\'\'')
            || diff.includes('Args:') || diff.includes('Returns:')
            || diff.includes('docstring') || diff.includes('@param')
          if (!hasDocstring) {
            return { passed: false, details: `${result.details} but diff doesn't contain docstring content` }
          }
          return { passed: true, details: `${result.details} with docstring content` }
        }
        catch {
          return result // fallback to basic edit check
        }
      },
    },

    // S5 [HARD] Zod — edit the main source file (large file handling)
    {
      name: 'Zod: Add JSDoc to export',
      difficulty: 'hard',
      repo: 'https://github.com/colinhacks/zod.git',
      branch: 'main',
      workDir: join(TEST_ROOT, 'zod'),
      goal: '',
      maxTurns: 12,
      maxTokenBudget: 100_000,
      validate: (ws) => {
        // Must edit an existing tracked .ts file, not write a new one
        const result = requireExistingFileEdit(ws, '.ts')
        if (!result.passed)
          return result
        // Check that JSDoc was added
        try {
          const diff = execSync('git diff', { cwd: ws, encoding: 'utf-8' })
          const hasJSDoc = diff.includes('/**') || diff.includes('* @')
          if (!hasJSDoc) {
            return { passed: false, details: `${result.details} but diff doesn't contain JSDoc` }
          }
          return { passed: true, details: `${result.details} with JSDoc` }
        }
        catch {
          return result
        }
      },
    },

    // S6 [HARD] AIRI monorepo — cross-file: rename a function and update callers
    {
      name: 'AIRI: Cross-file rename fix',
      difficulty: 'hard',
      repo: `local:${airiRoot}`,
      workDir: join(TEST_ROOT, 'airi-s6'),
      goal: '',
      maxTurns: 14,
      maxTokenBudget: 120_000,
      setup: (ws) => {
        // Plant a cross-file break:
        // 1. Rename a function in packages/ui/src/composables/use-theme.ts
        // 2. This will break any file that imports it
        const sourceFile = join(ws, 'packages/ui/src/composables/use-theme.ts')
        if (existsSync(sourceFile)) {
          let content = readFileSync(sourceFile, 'utf-8')
          // Rename the exported function — add "V2" suffix
          content = content.replace(
            /export\s+function\s+useTheme\b/,
            'export function useThemeV2',
          )
          writeFileSync(sourceFile, content)
        }
        // Also break the re-export in index.ts
        const indexFile = join(ws, 'packages/ui/src/index.ts')
        if (existsSync(indexFile)) {
          let content = readFileSync(indexFile, 'utf-8')
          // The re-export still references old name — this is the bug
          // Agent needs to find this and update it
          if (!content.includes('useTheme')) {
            // If there's no useTheme export, add one to create the break
            content = `export { useTheme } from './composables/use-theme'\n${content}`
            writeFileSync(indexFile, content)
          }
        }
      },
      validate: (ws) => {
        // Require at least 2 files changed
        try {
          const diff = execSync('git diff --name-only', { cwd: ws, encoding: 'utf-8' }).trim()
          const files = diff.split('\n').filter(f => f.trim().length > 0)
          if (files.length < 2) {
            return { passed: false, details: `Only ${files.length} file(s) changed: ${files.join(', ')}. Need ≥2 for cross-file fix.` }
          }
          // Check that the source file was handled
          const touchedSource = files.some(f => f.includes('use-theme'))
          const touchedCaller = files.some(f => f.includes('index'))
          if (!touchedSource && !touchedCaller) {
            return { passed: false, details: `Changed ${files.join(', ')} but neither use-theme nor index was fixed` }
          }
          return { passed: true, details: `Cross-file fix: ${files.join(', ')}` }
        }
        catch {
          return { passed: false, details: 'git diff failed' }
        }
      },
    },
  ]
}

// ─── Runner ───

function prepareWorkspace(scenario: RealWorldScenario): string {
  const ws = scenario.workDir

  // NOTICE: Hard guard — all workspaces MUST be under TEST_ROOT.
  // This prevents accidental pollution of the host filesystem if someone
  // misconfigures a scenario's workDir path.
  if (!ws.startsWith(TEST_ROOT)) {
    throw new Error(
      `Workspace path safety violation: "${ws}" is not under TEST_ROOT ("${TEST_ROOT}"). `
      + `All scenarios must use workDir inside TEST_ROOT to prevent host filesystem pollution.`,
    )
  }

  if (scenario.repo.startsWith('local:')) {
    const localPath = scenario.repo.slice('local:'.length)
    if (existsSync(join(ws, '.git'))) {
      execSync('git checkout . && git clean -fd', { cwd: ws, encoding: 'utf-8', timeout: 30_000 })
    }
    else {
      mkdirSync(ws, { recursive: true })
      execSync(`git clone --depth 1 --no-hardlinks file://${localPath} ${ws}`, {
        encoding: 'utf-8',
        timeout: 120_000,
      })
    }
  }
  else if (scenario.repo && !existsSync(join(ws, '.git'))) {
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

  // Run setup (e.g., plant bugs)
  if (scenario.setup) {
    scenario.setup(ws)
  }

  return ws
}

function buildGoal(scenario: RealWorldScenario, ws: string): string {
  if (scenario.goal)
    return scenario.goal

  if (scenario.name.includes('JSDoc') && scenario.name.includes('AIRI')) {
    return `You are working in a TypeScript monorepo at ${ws}.

TASK: Find a composable in packages/ui/src/ and add JSDoc to it.

1. Search for composable files in packages/ui/src/
2. Read the one you find
3. Add JSDoc to the exported function using edit_file — you MUST edit the existing file, do NOT create a new file
4. Read the file back to verify

Use absolute paths. Only modify existing files.`
  }

  if (scenario.name.includes('unused exports')) {
    return `You are working in a TypeScript monorepo at ${ws}.

TASK: Analyze packages/stage-ui/src/stores/ for unused exports.

1. List files in packages/stage-ui/src/stores/
2. Pick one store file and read it
3. Search the codebase for imports of its exports
4. Write analysis to ${ws}/analysis-report.md

This is read-only analysis — do NOT modify source files.
Use absolute paths.`
  }

  if (scenario.name.includes('planted') || scenario.name.includes('Fix planted')) {
    return `You are working in a TypeScript monorepo at ${ws}.

TASK: There is a deliberate bug in packages/ui/src/index.ts that causes a build error.
Find it and fix it.

1. Read packages/ui/src/index.ts — look for a broken import/export
2. The bug is a typo in an export name that doesn't match any real export from the source module
3. Fix the bug using edit_file — either correct the name or remove the broken line
4. Read the file back to verify the fix

Use absolute paths. Be precise. Only fix the bug, don't change anything else.`
  }

  if (scenario.name.includes('HTTPie')) {
    return `You are working in the HTTPie CLI repository at ${ws}.

TASK: Find an undocumented Python function and add a proper docstring.

CRITICAL: You MUST edit an EXISTING .py file using edit_file.
Do NOT create new temporary files. Do NOT use write_file to create a copy.
Find a real function in the existing codebase and edit it in-place.

1. List files in httpie/
2. Read a Python file (e.g., httpie/output/formatters/colors.py or httpie/cli/definition.py)
3. Find a function without a docstring
4. Add a docstring using edit_file with the exact function signature as old_text
5. Read the file back to verify

Use absolute paths. Only modify ONE existing file.`
  }

  if (scenario.name.includes('Zod')) {
    return `You are working in the Zod repository at ${ws}.

TASK: Add a JSDoc comment to an undocumented exported function or type.

CRITICAL: You MUST edit an EXISTING .ts file using edit_file.
Do NOT create new files. Do NOT use write_file.

1. Use list_files to discover the actual project structure (do NOT assume 'src/' exists — Zod uses 'packages/')
2. Navigate the directory tree to find the main source files
3. Use the File Outline to find an exported function without JSDoc
4. Add JSDoc using edit_file — match the exact existing text as old_text
5. Read the edited section back to verify

Use absolute paths. Only modify ONE existing file.`
  }

  if (scenario.name.includes('Cross-file') || scenario.name.includes('rename')) {
    return `You are working in a TypeScript monorepo at ${ws}.

TASK: Someone renamed the function \`useTheme\` to \`useThemeV2\` in packages/ui/src/composables/use-theme.ts
but forgot to update the re-export in packages/ui/src/index.ts. This causes a build error.

Fix ALL places that still reference the old name:

1. Read packages/ui/src/composables/use-theme.ts to confirm the current function name
2. Read packages/ui/src/index.ts to see the broken re-export
3. Search the codebase for other imports of \`useTheme\` that need updating
4. Fix each file using edit_file — update the old name to match the new one
5. Read each edited file back to verify

You MUST edit existing files using edit_file. Do NOT create new files.
Use absolute paths. Fix ALL broken references, not just one.`
  }

  return 'No goal defined'
}

async function runScenario(scenario: RealWorldScenario): Promise<ScenarioResult> {
  const workspacePath = prepareWorkspace(scenario)
  const goal = buildGoal(scenario, workspacePath)

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
        // NOTICE: Only log meaningful events. Streaming chunks are suppressed
        // to reduce noise — we only log the final "completed" streaming event.
        if (event.phase === 'streaming' && !event.message?.includes('completed')) {
          return // suppress intermediate streaming chunks
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
      difficulty: scenario.difficulty,
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
      difficulty: scenario.difficulty,
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

async function runSuite(airiRoot: string, runIndex: number, totalRuns: number): Promise<ScenarioResult[]> {
  if (totalRuns > 1) {
    console.log(`\n${'═'.repeat(60)}`)
    console.log(`  RUN ${runIndex + 1}/${totalRuns}`)
    console.log(`${'═'.repeat(60)}`)
  }

  const scenarios = buildScenarios(airiRoot)
  const results: ScenarioResult[] = []

  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i]
    const diffTag = `[${scenario.difficulty.toUpperCase()}]`
    console.log(`┌─── ${diffTag} S${i + 1}/${scenarios.length}: ${scenario.name} ───`)
    console.log(`│  Workspace: ${scenario.workDir}`)
    console.log(`│  Budget: ${scenario.maxTurns}T / ${(scenario.maxTokenBudget / 1000).toFixed(0)}K tokens`)

    const result = await runScenario(scenario)
    results.push(result)

    // NOTICE: Separate engine completion status from validation pass/fail.
    // A run can be `budget_exhausted` but still pass validation (task done under wire).
    // This distinction matters for honest benchmark reporting.
    const validIcon = result.passed ? '✅' : '❌'
    const engineIcon = result.status === 'completed' ? '🟢' : result.status === 'budget_exhausted' ? '🟡' : '🔴'
    const tokenStr = result.tokens > 0 ? `${Math.round(result.tokens / 1000)}K` : '⚠️ 0K (no usage data)'
    console.log(`│  ${validIcon} validation ${result.passed ? 'PASSED' : 'FAILED'} | ${engineIcon} engine: ${result.status}`)
    console.log(`│  ${result.turns}T | ${tokenStr} | ${result.durationS}s`)
    console.log(`│    Tools: ${result.toolsUsed.join(', ')}`)
    console.log(`│    Validation: ${result.validationDetails}`)
    if (result.error)
      console.log(`│    Error: ${result.error}`)
    console.log('└───\n')
  }

  return results
}

async function main() {
  const airiRoot = findAiriRoot()
  const runsArg = process.argv.indexOf('--runs')
  const totalRuns = runsArg >= 0 ? Number.parseInt(process.argv[runsArg + 1] || '1', 10) : 1

  console.log('╔═══════════════════════════════════════════════════════════╗')
  console.log('║     AIRI REAL-WORLD VALIDATION v2                        ║')
  console.log(`║     Model: ${(process.env.AIRI_AGENT_MODEL ?? 'gpt-5.4-mini').padEnd(46)}║`)
  console.log(`║     Runs: ${String(totalRuns).padEnd(47)}║`)
  console.log('╚═══════════════════════════════════════════════════════════╝')
  console.log(`  AIRI root: ${airiRoot}`)
  console.log(`  Test root: ${TEST_ROOT}`)
  console.log(`  All scenarios run in ISOLATED workspaces`)
  console.log('')

  mkdirSync(TEST_ROOT, { recursive: true })

  const allRuns: ScenarioResult[][] = []

  for (let r = 0; r < totalRuns; r++) {
    const results = await runSuite(airiRoot, r, totalRuns)
    allRuns.push(results)
  }

  // ─── Aggregate stats ───
  const scenarioNames = allRuns[0].map(r => r.name)
  const scenarioCount = scenarioNames.length

  console.log('\n╔═══════════════════════════════════════════════════════════╗')
  console.log('║              VALIDATION SCORECARD                        ║')
  console.log('╚═══════════════════════════════════════════════════════════╝\n')

  // Per-scenario stats
  for (let s = 0; s < scenarioCount; s++) {
    const name = scenarioNames[s]
    const diff = allRuns[0][s].difficulty
    const passes = allRuns.filter(run => run[s].passed).length
    const avgTokens = Math.round(allRuns.reduce((sum, run) => sum + (run[s].tokens || 0), 0) / totalRuns / 1000)
    const avgTime = (allRuns.reduce((sum, run) => sum + run[s].durationS, 0) / totalRuns).toFixed(1)
    const rate = Math.round(passes / totalRuns * 100)
    const icon = rate >= 80 ? '✅' : rate >= 50 ? '🟡' : '❌'
    console.log(`  ${icon} [${diff.toUpperCase()}] ${name}`)
    console.log(`     Pass: ${passes}/${totalRuns} (${rate}%) | Avg: ${avgTokens}K tokens, ${avgTime}s`)
    console.log('')
  }

  // Overall
  const totalPassed = allRuns.reduce((sum, run) => sum + run.filter(r => r.passed).length, 0)
  const totalTests = totalRuns * scenarioCount
  const overallRate = Math.round(totalPassed / totalTests * 100)
  const totalTokens = allRuns.reduce((sum, run) =>
    sum + run.reduce((s, r) => s + (r.tokens || 0), 0), 0)
  const totalTime = allRuns.reduce((sum, run) =>
    sum + run.reduce((s, r) => s + r.durationS, 0), 0)

  console.log(`  Overall: ${totalPassed}/${totalTests} (${overallRate}%)`)
  console.log(`  Total tokens: ${Math.round(totalTokens / 1000)}K`)
  console.log(`  Total time: ${totalTime.toFixed(1)}s`)

  if (totalRuns > 1) {
    // Per-run breakdown
    console.log('\n  Per-run breakdown:')
    for (let r = 0; r < totalRuns; r++) {
      const run = allRuns[r]
      const p = run.filter(x => x.passed).length
      const icons = run.map(x => x.passed ? '✅' : '❌').join('')
      console.log(`    Run ${r + 1}: ${p}/${scenarioCount} ${icons}`)
    }
  }

  console.log('')
  // NOTICE: Keep the conclusion descriptive, not absolute.
  // This suite is sampled and task-bounded; it is not a production-readiness gate.
  if (overallRate >= 80)
    console.log('  🟢 Sampled run-set shows strong task completion under current constraints')
  else if (overallRate >= 60)
    console.log('  🟡 Sampled run-set is mixed; additional hard cases are needed')
  else console.log('  🔴 Sampled run-set currently unstable; investigate failure clusters')

  // Save
  const reportPath = join(TEST_ROOT, 'validation-report-v2.json')
  writeFileSync(reportPath, JSON.stringify({
    runs: totalRuns,
    overallRate,
    totalPassed,
    totalTests,
    totalTokens,
    totalTime,
    allRuns,
  }, null, 2))
  console.log(`\n  Results saved to: ${reportPath}`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
