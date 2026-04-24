/**
 * Tool Descriptor Registry Tests
 */

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  allDescriptors,
  allDescriptorsIncludingInternal,
  createPopulatedRegistry,
  globalRegistry,
  initializeGlobalRegistry,
  validateToolsHaveDescriptors,
} from './index'
import { validateDescriptor } from './types'

describe('toolDescriptorRegistry', () => {
  describe('registry initialization', () => {
    it('should initialize with all descriptors', () => {
      const registry = createPopulatedRegistry()

      expect(registry.size).toBeGreaterThan(0)
      expect(registry.size).toBe(allDescriptorsIncludingInternal.length)
    })

    it('should not have duplicate canonical names', () => {
      const names = allDescriptorsIncludingInternal.map(d => d.canonicalName)
      const uniqueNames = new Set(names)

      expect(uniqueNames.size).toBe(names.length)
    })

    it('should have all required fields in each descriptor', () => {
      for (const descriptor of allDescriptorsIncludingInternal) {
        expect(() => validateDescriptor(descriptor)).not.toThrow()
      }
    })
  })

  describe('public descriptors', () => {
    it('should have only public descriptors in allDescriptors', () => {
      for (const descriptor of allDescriptors) {
        expect(descriptor.public).toBe(true)
      }
    })

    it('should have at least 50 public tools', () => {
      // We expect at least 50 public tools based on the inventory
      expect(allDescriptors.length).toBeGreaterThanOrEqual(50)
    })
  })

  describe('registry query', () => {
    it('should query by lane', () => {
      const registry = createPopulatedRegistry()
      const codingTools = registry.query({ lane: 'coding' })

      expect(codingTools.length).toBeGreaterThan(0)
      for (const tool of codingTools) {
        expect(tool.lane).toBe('coding')
      }
    })

    it('should query by kind', () => {
      const registry = createPopulatedRegistry()
      const readTools = registry.query({ kind: 'read' })

      expect(readTools.length).toBeGreaterThan(0)
      for (const tool of readTools) {
        expect(tool.kind).toBe('read')
      }
    })

    it('should query read-only tools', () => {
      const registry = createPopulatedRegistry()
      const readOnlyTools = registry.query({ readOnlyOnly: true })

      expect(readOnlyTools.length).toBeGreaterThan(0)
      for (const tool of readOnlyTools) {
        expect(tool.readOnly).toBe(true)
      }
    })

    it('should query tools requiring approval', () => {
      const registry = createPopulatedRegistry()
      const approvalTools = registry.query({ approvalRequiredOnly: true })

      expect(approvalTools.length).toBeGreaterThan(0)
      for (const tool of approvalTools) {
        expect(tool.requiresApprovalByDefault).toBe(true)
      }
    })

    it('should query by text search', () => {
      const registry = createPopulatedRegistry()
      const screenshotTools = registry.query({ query: 'screenshot' })

      expect(screenshotTools.length).toBeGreaterThan(0)
      for (const tool of screenshotTools) {
        const searchable = `${tool.canonicalName} ${tool.displayName} ${tool.summary}`.toLowerCase()
        expect(searchable).toContain('screenshot')
      }
    })

    it('should combine multiple filters', () => {
      const registry = createPopulatedRegistry()
      const results = registry.query({
        lane: 'coding',
        readOnlyOnly: true,
      })

      expect(results.length).toBeGreaterThan(0)
      for (const tool of results) {
        expect(tool.lane).toBe('coding')
        expect(tool.readOnly).toBe(true)
      }
    })
  })

  describe('registry lookup', () => {
    it('should get descriptor by canonical name', () => {
      const registry = createPopulatedRegistry()
      const desc = registry.get('accessibility_snapshot')

      expect(desc.canonicalName).toBe('accessibility_snapshot')
      expect(desc.lane).toBe('accessibility')
      expect(desc.kind).toBe('read')
    })

    it('should throw for unknown tool', () => {
      const registry = createPopulatedRegistry()

      expect(() => registry.get('nonexistent_tool')).toThrow(/Unknown tool/)
    })

    it('should return undefined for optional lookup of unknown tool', () => {
      const registry = createPopulatedRegistry()
      const desc = registry.getOptional('nonexistent_tool')

      expect(desc).toBeUndefined()
    })
  })

  describe('global registry', () => {
    it('should initialize global registry', () => {
      initializeGlobalRegistry()

      expect(globalRegistry.size).toBe(allDescriptorsIncludingInternal.length)
    })

    it('should be queryable after initialization', () => {
      initializeGlobalRegistry()
      const results = globalRegistry.query({ lane: 'desktop' })

      expect(results.length).toBeGreaterThan(0)
    })

    it('should have zero missing desktop grounding descriptors against register usage', () => {
      initializeGlobalRegistry()

      const descriptorsDir = dirname(fileURLToPath(import.meta.url))
      const serverDir = resolve(descriptorsDir, '..')
      const registerFiles = readdirSync(serverDir)
        .filter(fileName => fileName === 'register-desktop-grounding.ts')

      const toolNames = new Set<string>()
      const requireDescriptorPattern = /requireDescriptor\(\s*['"]([^'"]+)['"]\s*\)/g

      for (const fileName of registerFiles) {
        const source = readFileSync(resolve(serverDir, fileName), 'utf8')
        for (const match of source.matchAll(requireDescriptorPattern)) {
          const name = match[1]
          if (name)
            toolNames.add(name)
        }
      }

      expect(Array.from(toolNames).sort()).toEqual([
        'desktop_click_target',
        'desktop_observe',
      ])

      const result = validateToolsHaveDescriptors(Array.from(toolNames))

      expect(result.valid).toBe(true)
      expect(result.missing).toEqual([])
    })
  })

  describe('descriptor validation', () => {
    it('should validate lane values', () => {
      const invalidDescriptor = {
        canonicalName: 'test_tool',
        displayName: 'Test Tool',
        summary: 'A test tool',
        lane: 'invalid_lane' as const,
        kind: 'read' as const,
        readOnly: true,
        destructive: false,
        concurrencySafe: true,
        requiresApprovalByDefault: false,
        public: true,
      }

      expect(() => validateDescriptor(invalidDescriptor as never)).toThrow(/invalid lane/)
    })

    it('should validate kind values', () => {
      const invalidDescriptor = {
        canonicalName: 'test_tool',
        displayName: 'Test Tool',
        summary: 'A test tool',
        lane: 'desktop' as const,
        kind: 'invalid_kind' as const,
        readOnly: true,
        destructive: false,
        concurrencySafe: true,
        requiresApprovalByDefault: false,
        public: true,
      }

      expect(() => validateDescriptor(invalidDescriptor as never)).toThrow(/invalid kind/)
    })
  })

  describe('lane coverage', () => {
    it('should have descriptors for all expected lanes', () => {
      const registry = createPopulatedRegistry()
      const expectedLanes = [
        'desktop',
        'browser_dom',
        'browser_cdp',
        'coding',
        'pty',
        'display',
        'accessibility',
        'task_memory',
        'vscode',
        'workflow',
      ]

      const groups = registry.groupByLane()

      for (const lane of expectedLanes) {
        const tools = groups.get(lane as never)
        expect(tools, `Expected tools for lane: ${lane}`).toBeDefined()
        expect(tools!.length, `Expected at least one tool for lane: ${lane}`).toBeGreaterThan(0)
      }
    })
  })

  describe('specific tool descriptors', () => {
    it('should have correct accessibility_snapshot descriptor', () => {
      const registry = createPopulatedRegistry()
      const desc = registry.get('accessibility_snapshot')

      expect(desc.lane).toBe('accessibility')
      expect(desc.kind).toBe('read')
      expect(desc.readOnly).toBe(true)
      expect(desc.destructive).toBe(false)
      expect(desc.requiresApprovalByDefault).toBe(false)
    })

    it('should have correct terminal_exec descriptor', () => {
      const registry = createPopulatedRegistry()
      const desc = registry.get('terminal_exec')

      expect(desc.lane).toBe('desktop')
      expect(desc.kind).toBe('write')
      expect(desc.readOnly).toBe(false)
      expect(desc.destructive).toBe(true)
      expect(desc.requiresApprovalByDefault).toBe(true)
    })

    it('should have correct coding_apply_patch descriptor', () => {
      const registry = createPopulatedRegistry()
      const desc = registry.get('coding_apply_patch')

      expect(desc.lane).toBe('coding')
      expect(desc.kind).toBe('write')
      expect(desc.readOnly).toBe(false)
      expect(desc.destructive).toBe(true)
      expect(desc.requiresApprovalByDefault).toBe(true)
    })

    it('should have correct tool_directory descriptor', () => {
      const registry = createPopulatedRegistry()
      const desc = registry.get('tool_directory')

      expect(desc.lane).toBe('internal')
      expect(desc.kind).toBe('read')
      expect(desc.readOnly).toBe(true)
      expect(desc.public).toBe(true)
    })
  })

  describe('desktop grounding tool enablement', () => {
    // These 3 core desktop grounding tools must be eagerly enabled (defaultDeferred: false)
    // so the overlay can poll desktop_get_state, and agents can call desktop_observe / desktop_click_target
    // without needing an explicit enable step.
    const eagerlyEnabledTools = [
      'desktop_get_state',
      'desktop_observe',
      'desktop_click_target',
    ]

    for (const toolName of eagerlyEnabledTools) {
      it(`should have ${toolName} eagerly enabled (defaultDeferred: false)`, () => {
        const registry = createPopulatedRegistry()
        const desc = registry.get(toolName)

        expect(desc.defaultDeferred, `${toolName} must NOT be deferred — it is a core grounding tool`).toBeFalsy()
      })
    }

    // Other desktop interaction tools must remain deferred to avoid exposing
    // the full desktop surface without explicit enablement.
    const mustRemainDeferredTools = [
      'desktop_click',
      'desktop_type_text',
      'desktop_press_keys',
      'desktop_scroll',
      'desktop_open_app',
      'desktop_focus_app',
      'terminal_exec',
    ]

    for (const toolName of mustRemainDeferredTools) {
      it(`should keep ${toolName} deferred (defaultDeferred: true)`, () => {
        const registry = createPopulatedRegistry()
        const desc = registry.get(toolName)

        expect(desc.defaultDeferred, `${toolName} must remain deferred`).toBe(true)
      })
    }
  })
})
