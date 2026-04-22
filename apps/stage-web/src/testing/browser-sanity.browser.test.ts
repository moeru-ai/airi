import { describe, expect, it } from 'vitest'

describe('browser sanity', () => {
  it('runs in the browser environment', () => {
    expect(window.document).toBeInstanceOf(Document)
    expect(document.body).toBeInstanceOf(HTMLBodyElement)
  })
})
