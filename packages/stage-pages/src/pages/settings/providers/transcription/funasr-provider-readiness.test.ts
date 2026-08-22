import { describe, expect, it } from 'vitest'

import { isFunASRPlaygroundReady } from './funasr-provider-readiness'

describe('funASR provider readiness', () => {
  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3834871849
  it('requires configured status and complete settings (GitHub #2122)', () => {
    // ROOT CAUSE:
    //
    // The playground accepted an invalid provider when its old model remained nonempty.
    expect(isFunASRPlaygroundReady('invalid', 'http://localhost:8000/v1/', 'sensevoice')).toBe(false)
    expect(isFunASRPlaygroundReady('configured', '', 'sensevoice')).toBe(false)
    expect(isFunASRPlaygroundReady('configured', 'http://localhost:8000/v1/', '')).toBe(false)
    expect(isFunASRPlaygroundReady('configured', 'http://localhost:8000/v1/', 'sensevoice')).toBe(true)
  })
})
