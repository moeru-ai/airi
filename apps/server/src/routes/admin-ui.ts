import type { Env } from '../libs/env'
import type { HonoEnv } from '../types/hono'

import { Hono } from 'hono'

import { buildAdminUiRedirectUrl, SERVER_ADMIN_UI_BASE_PATH } from '../utils/server-admin-ui'

export function createAdminUiRoutes(env: Env) {
  return new Hono<HonoEnv>()
    .get(SERVER_ADMIN_UI_BASE_PATH, c => c.redirect(buildAdminUiRedirectUrl(env.ADMIN_UI_URL, c.req.url, env.API_SERVER_URL)))
    .get(`${SERVER_ADMIN_UI_BASE_PATH}/*`, c => c.redirect(buildAdminUiRedirectUrl(env.ADMIN_UI_URL, c.req.url, env.API_SERVER_URL)))
}
