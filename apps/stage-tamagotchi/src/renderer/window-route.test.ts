import { describe, expect, it } from 'vitest'

import { resolveInitialWindowRoutePath } from './window-route'

describe('resolveInitialWindowRoutePath', () => {
  it('uses the hash route before Vue Router hydrates', () => {
    expect(resolveInitialWindowRoutePath('/', '#/chat?source=tray')).toBe('/chat')
  })

  it('uses the router path when no hash route exists', () => {
    expect(resolveInitialWindowRoutePath('/settings/data', '')).toBe('/settings/data')
  })
})
