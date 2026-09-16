import type { RequestAuthSession } from '../libs/request-auth'

export interface HonoEnv {
  Variables: {
    user: RequestAuthSession['user'] | null
    session: RequestAuthSession['session'] | null
  }
}
