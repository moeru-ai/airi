import { describe, expect, it } from 'vitest'

import { buildCrossLaneAdvisory, shouldUpdateActiveLane } from './tool-lane-hygiene'

describe('tool-lane-hygiene', () => {
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

    it('does not trigger advisory when tool lane is workflow (exempt)', () => {
      const result = buildCrossLaneAdvisory({
        toolName: 'workflow_coding_loop',
        toolLane: 'workflow',
        inferredActiveLane: 'coding',
      })
      expect(result).toBeNull()
    })

    it('does not trigger advisory when tool lane is internal (exempt)', () => {
      const result = buildCrossLaneAdvisory({
        toolName: 'debug_state',
        toolLane: 'internal',
        inferredActiveLane: 'desktop',
      })
      expect(result).toBeNull()
    })

    it('does not trigger advisory when tool lane is display (exempt)', () => {
      const result = buildCrossLaneAdvisory({
        toolName: 'list_displays',
        toolLane: 'display',
        inferredActiveLane: 'browser_dom',
      })
      expect(result).toBeNull()
    })

    it('does not trigger advisory when tool lane is task_memory (exempt)', () => {
      const result = buildCrossLaneAdvisory({
        toolName: 'task_memory_get',
        toolLane: 'task_memory',
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

    it('triggers advisory for desktop -> coding cross-lane', () => {
      const result = buildCrossLaneAdvisory({
        toolName: 'coding_apply_patch',
        toolLane: 'coding',
        inferredActiveLane: 'desktop',
      })
      expect(result).toContain('Advisory')
      expect(result).toContain('desktop')
      expect(result).toContain('coding')
    })

    it('triggers advisory for pty -> browser_dom cross-lane', () => {
      const result = buildCrossLaneAdvisory({
        toolName: 'browser_dom_read_page',
        toolLane: 'browser_dom',
        inferredActiveLane: 'pty',
      })
      expect(result).toContain('Advisory')
      expect(result).toContain('pty')
      expect(result).toContain('browser_dom')
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
