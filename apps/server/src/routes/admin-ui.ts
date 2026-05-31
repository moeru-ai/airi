import type { Env } from '../libs/env'
import type { HonoEnv } from '../types/hono'

import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'

import { getServerAdminUiDistDir, renderServerAdminUiHtml, SERVER_ADMIN_UI_BASE_PATH } from '../utils/server-admin-ui'

const RE_SERVER_ADMIN_UI_BASE_PATH = /^\/admin/

export function createAdminUiRoutes(env: Env) {
  return new Hono<HonoEnv>()
    .get(SERVER_ADMIN_UI_BASE_PATH, c => c.redirect(`${SERVER_ADMIN_UI_BASE_PATH}/`))
    .use(`${SERVER_ADMIN_UI_BASE_PATH}/*`, serveStatic({
      root: getServerAdminUiDistDir(),
      rewriteRequestPath: (path: string) => path.replace(RE_SERVER_ADMIN_UI_BASE_PATH, ''),
    }))
    .on('GET', `${SERVER_ADMIN_UI_BASE_PATH}/*`, (c) => {
      return c.html(renderServerAdminUiHtml({
        apiServerUrl: env.API_SERVER_URL,
        currentUrl: c.req.url,
      }))
    })
}
