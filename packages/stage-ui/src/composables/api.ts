// NOTE: hono/client and the server backend are not available in desktop-only mode.
// Providing a stub client to avoid import-time failures.
import { SERVER_URL } from '../libs/server'

/** Minimal stub for the Hono RPC client used in desktop-only mode. */
interface StageApiClientStub {
  $url: () => string
  // eslint-disable-next-line ts/no-explicit-any -- deep Hono RPC proxy chain, replaced at build time by the real client
  api: any
  /** Stub — no server to call */
  // eslint-disable-next-line ts/no-explicit-any -- same reason as api: deep chained proxy replaced at build time
  [key: string]: any
}

export const client = {
  $url: () => SERVER_URL,
  api: undefined as unknown as StageApiClientStub['api'],
} as StageApiClientStub

export type StageApiClient = typeof client
