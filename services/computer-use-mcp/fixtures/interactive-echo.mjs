#!/usr/bin/env node
/**
 * Deterministic interactive program for PTY E2E testing.
 *
 * Behaviour:
 *   1. Prints "READY> " prompt to stdout
 *   2. Reads one line of input from stdin
 *   3. Prints "ECHO: <input>" followed by "DONE"
 *   4. Exits with code 0
 *
 * This avoids unpredictable TUI programs (vim, less, top) while still
 * exercising the real PTY read/write/lifecycle path.
 */

import { createInterface } from 'node:readline'

const rl = createInterface({ input: process.stdin, output: process.stdout })

process.stdout.write('READY> ')

rl.once('line', (line) => {
  process.stdout.write(`ECHO: ${line}\n`)
  process.stdout.write('DONE\n')
  rl.close()
  process.exit(0)
})
