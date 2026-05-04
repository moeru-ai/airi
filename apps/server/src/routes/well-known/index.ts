import type { Env } from '../../libs/env'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'

export interface WellKnownDeps {
  env: Env
}

export function createWellKnownRoutes(deps: WellKnownDeps) {
  return new Hono<HonoEnv>()
    .get('/assetlinks.json', (c) => {
      const pkg = deps.env.ASSETLINKS_PACKAGE_NAME
      const fingerprintsRaw = deps.env.ASSETLINKS_SHA256_FINGERPRINTS

      const fingerprints = fingerprintsRaw
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)

      const payload = [
        {
          relation: ['delegate_permission/common.handle_all_urls'],
          target: {
            namespace: 'android_app',
            package_name: pkg,
            sha256_cert_fingerprints: fingerprints,
          },
        },
      ]

      return c.json(payload)
    })
}
