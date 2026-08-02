#!/usr/bin/env node

import process from 'node:process'

import { errorMessageFrom } from '@moeru/std'

import { runApiServer } from './server'

/**
 * Starts only the AIRI resource API dependency graph.
 *
 * Call stack:
 *
 * main
 *   -> {@link runApiServer}
 *     -> createApp
 *       -> buildApp
 */
async function main(): Promise<void> {
  await runApiServer()
}

void main().catch((error: unknown) => {
  process.stderr.write(`${errorMessageFrom(error) ?? 'Unknown API server error'}\n`)
  process.exit(1)
})
