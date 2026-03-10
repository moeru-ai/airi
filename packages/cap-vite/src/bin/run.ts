#!/usr/bin/env node

import process from 'node:process'

import { runCapVite } from '..'
import { parseCapViteCliArgs } from '../cli'

async function main() {
  const parsed = parseCapViteCliArgs(process.argv.slice(2))
  if (!parsed) {
    return
  }

  await runCapVite(parsed.platform, parsed.target, { capArgs: parsed.capArgs })
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
