// NOTE: hono/client and the server backend are not available in desktop-only mode.
// Providing a stub client to avoid import-time failures.
import { authedFetch } from '../libs/auth-fetch'
import { SERVER_URL } from '../libs/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const client: any = {
  $url: () => SERVER_URL,
  // Stub — no server to call
}

export type StageApiClient = typeof client
