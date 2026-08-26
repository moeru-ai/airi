import type { RequestAuthSession } from '../libs/request-auth'

export interface HonoEnv {
  Variables: {
    session: null | RequestAuthSession['session']
    user: null | RequestAuthSession['user']
  }
}
