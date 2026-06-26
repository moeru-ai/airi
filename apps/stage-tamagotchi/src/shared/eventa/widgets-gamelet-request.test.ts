import { describe, expect, it } from 'vitest'

import {
  widgetsIframeRequestEvent,
  widgetsIframeRequestResultEvent,
} from './index'

describe('widgets iframe request events', () => {
  it('uses stable event ids for main renderer gamelet request relay', () => {
    expect(widgetsIframeRequestEvent.id).toBe('eventa:event:electron:windows:widgets:iframe-request')
    expect(widgetsIframeRequestResultEvent.id).toBe('eventa:event:electron:windows:widgets:iframe-request-result')
  })
})
