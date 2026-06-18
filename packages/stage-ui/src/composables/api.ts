// NOTE: hono/client and the server backend are not available in desktop-only mode.
// Providing a stub client to avoid import-time failures.
import { SERVER_URL } from '../libs/server'

/** Minimal stub for the Hono RPC client used in desktop-only mode. */
interface StageApiClientStub {
  $url: () => string
  api: any
  /** Stub — no server to call */
  [key: string]: any
}

export const client = {
  $url: () => SERVER_URL,
  api: undefined as any,
} as StageApiClientStub

export type StageApiClient = typeof client
