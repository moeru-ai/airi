import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'

export function createWellKnownRoutes() {
  return new Hono<HonoEnv>()
    .get('/assetlinks.json', (c) => {
      const payload = [
        {
          relation: ['delegate_permission/common.handle_all_urls'],
          target: { namespace: 'android_app', package_name: 'ai.moeru.airi_pocket', sha256_cert_fingerprints: ['1D:E5:2D:DC:89:DA:C9:C1:4B:5F:4A:48:E4:2D:62:E5:52:82:B7:41:D3:96:73:13:91:C8:41:D2:84:DF:84:55'] },
        },
      ]

      return c.json(payload)
    })
}
