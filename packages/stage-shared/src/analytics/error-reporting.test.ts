import { describe, expect, it } from 'vitest'

import { selectErrorReportingIntegrations } from './error-reporting'

describe('selectErrorReportingIntegrations', () => {
  it('removes the session and console integrations, then adds the extras', () => {
    const defaults = ['InboundFilters', 'BrowserSession', 'MainProcessSession', 'Console', 'Breadcrumbs', 'LinkedErrors']
      .map(name => ({ name }))
    const breadcrumbs = { name: 'Breadcrumbs', console: false }

    expect(selectErrorReportingIntegrations<{ name: string }>(defaults, [breadcrumbs]))
      .toEqual([{ name: 'InboundFilters' }, { name: 'Breadcrumbs' }, { name: 'LinkedErrors' }, breadcrumbs])
  })
})
