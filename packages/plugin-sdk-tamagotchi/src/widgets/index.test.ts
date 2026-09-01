import { describe, expect, it } from 'vitest'

import { widgetsIframeBroadcastEvent, widgetsIframeInitEvent } from './index'

describe('tamagotchi widget bridge contracts', () => {
  it('keeps iframe channel and event names stable', () => {
    expect(widgetsIframeBroadcastEvent.id).toBe('eventa:event:widgets:ui-iframe:broadcast')
    expect(widgetsIframeInitEvent.id).toBe('eventa:event:widgets:ui-iframe:init')
  })
})
