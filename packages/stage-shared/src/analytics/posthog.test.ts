import { describe, expect, it } from 'vitest'

import { stripPosthogUrlQueries } from './posthog'

describe('stripPosthogUrlQueries', () => {
  it('removes queries and fragments from URL properties and person properties', () => {
    const event = stripPosthogUrlQueries({
      uuid: 'event-1',
      event: '$pageview',
      properties: {
        $current_url: 'https://example.com/callback?code=private#state',
        $referrer: 'https://example.com/login?next=/home',
        $pathname: '/callback',
        plan: 'pro?',
      },
      $set_once: { $initial_current_url: 'https://example.com/?code=private' },
    })
    expect(event?.properties).toEqual({
      $current_url: 'https://example.com/callback',
      $referrer: 'https://example.com/login',
      $pathname: '/callback',
      plan: 'pro?',
    })
    expect(event?.$set_once).toEqual({ $initial_current_url: 'https://example.com/' })
  })
})
