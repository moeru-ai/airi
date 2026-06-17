// NOTE: hono/client and the server backend are not available in desktop-only mode.
// Providing a stub client to avoid import-time failures.
import { SERVER_URL } from '../libs/server'

/** Minimal stub for the Hono RPC client used in desktop-only mode. */
interface StageApiClientStub {
  $url: () => string
  /** Stub — no server to call */
  [key: string]: unknown
}

export const client: StageApiClientStub = {
  $url: () => SERVER_URL,
}

export type StageApiClient = typeof client
