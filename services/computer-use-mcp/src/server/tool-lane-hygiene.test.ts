import { describe, expect, it } from 'vitest'

import {
  buildCrossLaneAdvisory,
  inferToolLane,
  shouldUpdateActiveLane,
} from './tool-lane-hygiene'

describe('tool-lane-hygiene', () => {
  describe('inferToolLane', () => {
    it('looks up a tool lane from the descriptor registry', () => {
      expect(inferToolLane('desktop_click')).toBe('desktop')
    })
  })

  describe('buildCrossLaneAdvisory', () => {
    it('returns null when no active lane is established', () => {
      const result = buildCrossLaneAdvisory({
        toolName: 'browser_dom_click',
        toolLane: 'browser_dom',
        inferredActiveLane: undefined,
      })
      expect(result).toBeNull()
    })

    it('returns null when tool lane matches active lane', () => {
      const result = buildCrossLaneAdvisory({
        toolName: 'coding_read_file',
        toolLane: 'coding',
        inferredActiveLane: 'coding',
      })
      expect(result).toBeNull()
    })

    it('returns advisory when tool lane differs from active lane', () => {
      const result = buildCrossLaneAdvisory({
        toolName: 'browser_dom_click',
        toolLane: 'browser_dom',
        inferredActiveLane: 'coding',
      })
      expect(result).toContain('Advisory')
      expect(result).toContain('coding')
      expect(result).toContain('browser_dom')
      expect(result).toContain('browser_dom_click')
    })

    it('does not trigger advisory when tool lane is workflow', () => {
      const result = buildCrossLaneAdvisory({
        toolName: 'workflow_coding_loop',
        toolLane: 'workflow',
        inferredActiveLane: 'coding',
      })
      expect(result).toBeNull()
    })

    it('does not trigger advisory when active lane is exempt', () => {
      const result = buildCrossLaneAdvisory({
        toolName: 'browser_dom_click',
        toolLane: 'browser_dom',
        inferredActiveLane: 'workflow',
      })
      expect(result).toBeNull()
    })

    it('triggers advisory for desktop to coding cross-lane usage', () => {
      const result = buildCrossLaneAdvisory({
        toolName: 'coding_apply_patch',
        toolLane: 'coding',
        inferredActiveLane: 'desktop',
      })
      expect(result).toContain('Advisory')
      expect(result).toContain('desktop')
      expect(result).toContain('coding')
    })
  })

  describe('shouldUpdateActiveLane', () => {
    it('returns true for non-exempt lanes', () => {
      expect(shouldUpdateActiveLane('coding')).toBe(true)
      expect(shouldUpdateActiveLane('desktop')).toBe(true)
      expect(shouldUpdateActiveLane('browser_dom')).toBe(true)
      expect(shouldUpdateActiveLane('browser_cdp')).toBe(true)
      expect(shouldUpdateActiveLane('pty')).toBe(true)
      expect(shouldUpdateActiveLane('accessibility')).toBe(true)
      expect(shouldUpdateActiveLane('vscode')).toBe(true)
    })

    it('returns false for exempt lanes', () => {
      expect(shouldUpdateActiveLane('workflow')).toBe(false)
      expect(shouldUpdateActiveLane('internal')).toBe(false)
      expect(shouldUpdateActiveLane('task_memory')).toBe(false)
      expect(shouldUpdateActiveLane('display')).toBe(false)
    })
  })
})
