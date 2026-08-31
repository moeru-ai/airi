#!/usr/bin/env node

import process from 'node:process'

import { errorMessageFrom } from '@moeru/std'

import { runAuthServer } from './server'

/**
 * Starts only the AIRI Auth dependency graph.
 *
 * Call stack:
 *
 * main
 *   -> {@link runAuthServer}
 *     -> createAuthServer
 *       -> buildAuthApp
 */
async function main(): Promise<void> {
  await runAuthServer()
}

void main().catch((error: unknown) => {
  process.stderr.write(`${errorMessageFrom(error) ?? 'Unknown auth server error'}\n`)
  process.exit(1)
})
