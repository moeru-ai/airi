import type { AuthSession } from '@proj-airi/auth-shared'

export interface HonoEnv {
  Variables: {
    user: AuthSession['user'] | null
    session: AuthSession['session'] | null
  }
}
