import { describe, expect, it } from 'vitest'

import { createChatActionMenuItems } from './menu-items'

/**
 * @example
 * describe('createChatActionMenuItems', () => {
 *   it('includes retry between copy and delete when retry is available', () => {})
 * })
 */
describe('createChatActionMenuItems', () => {
  /**
   * @example
   * it('includes retry between copy and delete when retry is available', () => {
   *   const items = createChatActionMenuItems({ canCopy: true, canRetry: true, canDelete: true })
   *   expect(items.map(item => item.action)).toEqual(['copy', 'retry', 'delete'])
   * })
   */
  it('includes retry between copy and delete when retry is available', () => {
    const items = createChatActionMenuItems({
      canCopy: true,
      canRetry: true,
      canDelete: true,
    })

    expect(items.map(item => item.action)).toEqual(['copy', 'retry', 'delete'])
    expect(items[1]?.label).toBe('Retry')
  })

  /**
   * @example
   * it('omits retry when retry is unavailable', () => {
   *   const items = createChatActionMenuItems({ canCopy: true, canRetry: false, canDelete: true })
   *   expect(items.map(item => item.action)).toEqual(['copy', 'delete'])
   * })
   */
  it('omits retry when retry is unavailable', () => {
    const items = createChatActionMenuItems({
      canCopy: true,
      canRetry: false,
      canDelete: true,
    })

    expect(items.map(item => item.action)).toEqual(['copy', 'delete'])
  })
})
