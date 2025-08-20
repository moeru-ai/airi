import { describe, it } from 'vitest'

import { pipeline } from '.'

describe('pipeline', { timeout: 30000 }, async () => {
  it('should work', async () => {
    pipeline()
  })
})
