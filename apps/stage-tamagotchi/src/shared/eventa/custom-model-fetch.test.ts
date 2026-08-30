import { describe, expect, it } from 'vitest'

import {
  electronCustomModelFetch,
  electronCustomModelFetchCancel,
} from './custom-model-fetch'

describe('custom model fetch Eventa contract', () => {
  it('uses stable invoke ids for request, stream, error, and cancel', () => {
    expect(electronCustomModelFetch.sendEvent.id.replace(/-send$/, '')).toBe(
      'eventa:invoke:electron:custom-model:fetch',
    )
    expect(electronCustomModelFetch.receiveEvent.id.replace(/-receive$/, '')).toBe(
      'eventa:invoke:electron:custom-model:fetch',
    )
    expect(electronCustomModelFetchCancel.sendEvent.id.replace(/-send$/, '')).toBe(
      'eventa:invoke:electron:custom-model:fetch:cancel',
    )
  })
})
