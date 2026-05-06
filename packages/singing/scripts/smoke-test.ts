/* eslint-disable no-console */
/**
 * Script: End-to-end smoke test for the singing pipeline.
 * Verifies that the Python worker can be invoked and responds correctly.
 *
 * Usage: pnpm -F @proj-airi/singing exec tsx scripts/smoke-test.ts
 */

async function smokeTest(): Promise<void> {
  console.log('[smoke-test] Not yet implemented.')
  console.log('[smoke-test] Will test: Python worker health check -> short pipeline run.')
}

smokeTest().catch(console.error)
