import process, { env } from 'node:process'

import { startComputerUseMcpServer } from '@proj-airi/computer-use-mcp'

/**
 * Runs the bundled service without a global Node installation.
 *
 * Call stack:
 * Electron RUN_AS_NODE -> startComputerUseMcpServer -> stdio tools
 */
// This flag starts the bundled Electron binary as Node. Shell children must not inherit it.
delete env.ELECTRON_RUN_AS_NODE

void startComputerUseMcpServer().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
