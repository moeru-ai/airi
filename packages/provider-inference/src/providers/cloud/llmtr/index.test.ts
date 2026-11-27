import { describe, expect, it } from 'vitest'

import { getDefinedProvider } from '../../../index'
import { LLMTR_DEFAULT_BASE_URL, providerLlmtr } from './index'

describe('llmtr provider', () => {
  it('is registered with the LLMTR endpoint as default', () => {
    expect(getDefinedProvider('llmtr')).toBe(providerLlmtr)
    expect(LLMTR_DEFAULT_BASE_URL).toBe('https://llmtr.com/v1/')
  })
})
