/**
 * Runs the five plugin scenarios and prints a timeline of each one.
 *
 * pnpm -F @proj-airi/plugin-sdk exec tsx examples/scenarios.ts [s1..s5|all]
 *
 * Each line comes from injeca `observe()`: phase changes, status changes, and hook decisions.
 * Lines with `?` come from `graph().explain()`. Lines with `·` are notes of the scenario.
 */
import type { ScenarioPrinter } from './scenarios/run'

import process from 'node:process'

import { runS1, runS2, runS3, runS4, runS5 } from './scenarios/run'

const scenarios: Record<string, (print: ScenarioPrinter) => Promise<unknown>> = {
  s1: runS1,
  s2: runS2,
  s3: runS3,
  s4: runS4,
  s5: runS5,
}

async function main(): Promise<void> {
  const selected = process.argv[2] ?? 'all'
  const names = selected === 'all' ? Object.keys(scenarios) : [selected]
  const print: ScenarioPrinter = line => process.stdout.write(`${line}\n`)

  for (const name of names) {
    const run = scenarios[name]
    if (!run) {
      process.stderr.write(`Unknown scenario: ${name}. Use one of ${Object.keys(scenarios).join(', ')}, or all.\n`)
      process.exitCode = 1
      return
    }
    print(`\n━━━ ${name.toUpperCase()} ━━━`)
    await run(print)
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exitCode = 1
})
