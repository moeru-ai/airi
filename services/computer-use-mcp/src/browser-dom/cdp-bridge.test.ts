import { describe, expect, it } from 'vitest'

import { CdpBridge } from '../browser-dom/cdp-bridge'

describe('cdpBridge', () => {
  it('creates with correct initial status', () => {
    const bridge = new CdpBridge({
      cdpUrl: 'http://localhost:9222',
      requestTimeoutMs: 10_000,
    })

    const status = bridge.getStatus()
    expect(status.cdpUrl).toBe('http://localhost:9222')
    expect(status.connected).toBe(false)
    expect(status.pageTitle).toBeUndefined()
    expect(status.pageUrl).toBeUndefined()
    expect(status.lastError).toBeUndefined()
  })

  it('formats empty AX tree correctly', () => {
    const bridge = new CdpBridge({
      cdpUrl: 'http://localhost:9222',
      requestTimeoutMs: 10_000,
    })

    const text = bridge.formatAXTreeAsText({
      nodes: [],
      pageUrl: 'https://example.com',
      pageTitle: 'Example',
      capturedAt: '2025-01-01T00:00:00.000Z',
    })

    expect(text).toContain('[Browser AXTree] Example (https://example.com)')
  })

  it('formats AX tree with nodes', () => {
    const bridge = new CdpBridge({
      cdpUrl: 'http://localhost:9222',
      requestTimeoutMs: 10_000,
    })

    const text = bridge.formatAXTreeAsText({
      nodes: [
        {
          nodeId: '1',
          role: 'RootWebArea',
          name: 'Example Page',
          children: [
            {
              nodeId: '2',
              role: 'heading',
              name: 'Welcome',
              children: [],
            },
            {
              nodeId: '3',
              role: 'textbox',
              name: 'Search',
              value: 'hello world',
              focused: true,
              children: [],
            },
          ],
        },
      ],
      pageUrl: 'https://example.com',
      pageTitle: 'Example',
      capturedAt: '2025-01-01T00:00:00.000Z',
    })

    expect(text).toContain('RootWebArea "Example Page"')
    expect(text).toContain('heading "Welcome"')
    expect(text).toContain('textbox "Search" val="hello world" [focused]')
  })

  it('truncates long values in AX tree format', () => {
    const bridge = new CdpBridge({
      cdpUrl: 'http://localhost:9222',
      requestTimeoutMs: 10_000,
    })

    const longValue = 'A'.repeat(200)
    const text = bridge.formatAXTreeAsText({
      nodes: [
        {
          nodeId: '1',
          role: 'textbox',
          value: longValue,
          children: [],
        },
      ],
      pageUrl: 'https://example.com',
      pageTitle: 'Example',
      capturedAt: '2025-01-01T00:00:00.000Z',
    })

    expect(text).toContain('...')
    expect(text).not.toContain('A'.repeat(200))
  })

  it('rejects send when not connected', async () => {
    const bridge = new CdpBridge({
      cdpUrl: 'http://localhost:9222',
      requestTimeoutMs: 10_000,
    })

    await expect(bridge.send('Runtime.evaluate', {})).rejects.toThrow('CDP bridge is not connected')
  })

  it('close is safe to call when not connected', async () => {
    const bridge = new CdpBridge({
      cdpUrl: 'http://localhost:9222',
      requestTimeoutMs: 10_000,
    })

    // Should not throw
    await bridge.close()
    expect(bridge.getStatus().connected).toBe(false)
  })
})
