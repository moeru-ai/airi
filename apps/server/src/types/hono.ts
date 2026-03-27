import type { AuthUser } from '../libs/auth'

export interface HonoEnv {
  Variables: {
    user: AuthUser | null
  }
}
