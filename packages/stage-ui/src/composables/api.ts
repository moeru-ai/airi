// NOTE: hono/client and the server backend are not available in desktop-only mode.
// Providing a stub client to avoid import-time failures.
import { SERVER_URL } from '../libs/server'

export const client: any = {
  $url: () => SERVER_URL,
  // Stub — no server to call
}

export type StageApiClient = typeof client
