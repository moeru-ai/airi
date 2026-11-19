import { describe, expect, it } from 'vitest'

import { sharedSentryOptions } from './sentry'

describe('sharedSentryOptions', () => {
  it('removes the session integrations and keeps the others', () => {
    const defaults = ['InboundFilters', 'BrowserSession', 'MainProcessSession', 'Breadcrumbs'].map(name => ({ name }))

    expect(sharedSentryOptions.integrations(defaults)).toEqual([{ name: 'InboundFilters' }, { name: 'Breadcrumbs' }])
  })

  it('drops console breadcrumbs and keeps the others', () => {
    const click = { category: 'ui.click' }

    expect(sharedSentryOptions.beforeBreadcrumb({ category: 'console' })).toBeNull()
    expect(sharedSentryOptions.beforeBreadcrumb(click)).toBe(click)
  })
})
