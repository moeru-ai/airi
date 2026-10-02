import type { AcpAgentOptions } from './agent'

import process from 'node:process'

import { Readable, Writable } from 'node:stream'

import { ndJsonStream } from '@agentclientprotocol/sdk'

import { createAcpAgent } from './agent'

export { createAcpAgent } from './agent'
export type { AcpAgentOptions } from './agent'
export {
  ACP_BRIDGE_PORT,
  ACP_BRIDGE_URL,
  ACP_CLIENT_DISCONNECTED,
  AIRI_DESKTOP_NOT_STARTED,
  connectAcpBridge,
} from './bridge'
export type { AcpBridge, AcpBridgeCapabilities } from './bridge'

/**
 * Serves one ACP Client on stdin and stdout.
 *
 * The desktop application must already be open. This process does not run a model.
 */
export async function serveStdio(options?: AcpAgentOptions) {
  const { app } = await createAcpAgent(options)
  const connection = app.connect(ndJsonStream(
    Writable.toWeb(process.stdout),
    Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>,
  ))
  await connection.closed
}
