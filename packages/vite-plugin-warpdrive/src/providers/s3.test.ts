import { join } from 'node:path'
import { cwd, env } from 'node:process'

import { describe, expect, it } from 'vitest'

import { createS3Provider } from './s3'

describe('s3', (test) => {
  if (!env.S3_ENDPOINT || !env.S3_REGION || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
    test.skip('S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be set in environment to run this test', () => {})
    return
  }

  // eslint-disable-next-line test/prefer-lowercase-title
  describe('S3Provider', () => {
    it('should skip upload', async () => {
      const s3 = createS3Provider({
        endpoint: env.S3_ENDPOINT,
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        region: env.S3_REGION,
        publicBaseUrl: env.WARP_DRIVE_PUBLIC_BASE ?? env.S3_ENDPOINT,
      })

      expect(await s3.shouldSkipUpload(join(cwd(), 'packages', 'stage-ui', 'src', 'assets', 'live2d', 'models', 'hiyori_free_zh.zip'), '/proj-airi/stage-web/assets/hiyori_free_zh-D9UJNK98.zip')).toBe(true)
    })
  })
})
