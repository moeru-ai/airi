import process from 'node:process'

import { spawnSync } from 'node:child_process'

/**
 * Verifies the real Node parent channel against the native descriptor checks.
 * Call stack: native-stdio -> spawnSync -> native-protocol-test -> privateParentChannel.
 */
const { stdout, stderr, error, status } = spawnSync(process.argv[2], ['--verify-parent-stdio'], {
  encoding: 'utf8',
  stdio: ['pipe', 'pipe', 'pipe'],
  timeout: 5000,
})
process.stdout.write(stdout ?? '')
process.stderr.write(stderr ?? '')
if (error)
  throw error
process.exit(status ?? 1)
