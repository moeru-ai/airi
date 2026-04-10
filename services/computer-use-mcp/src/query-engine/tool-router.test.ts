import { describe, expect, it, vi } from 'vitest'

import { executeToolCall, getToolDefinitions } from './tool-router'

describe('tool-router', () => {
  describe('getToolDefinitions', () => {
    it('returns at least 5 tool definitions', () => {
      const defs = getToolDefinitions()
      expect(defs.length).toBeGreaterThanOrEqual(5)
    })

    it('returns definitions with required fields', () => {
      const defs = getToolDefinitions()
      for (const def of defs) {
        expect(def.name).toBeTruthy()
        expect(def.description).toBeTruthy()
        expect(def.parameters).toBeDefined()
        expect(def.parameters.type).toBe('object')
      }
    })

    it('includes core coding tools', () => {
      const defs = getToolDefinitions()
      const names = defs.map(d => d.name)
      expect(names).toContain('read_file')
      expect(names).toContain('write_file')
      expect(names).toContain('list_files')
      expect(names).toContain('search_text')
      expect(names).toContain('bash')
      expect(names).toContain('web_fetch')
    })
  })

  describe('executeToolCall', () => {
    it('returns error for unknown tool', async () => {
      const routes = {}
      const { result, error } = await executeToolCall(routes, 'nonexistent', '{}')
      expect(error).toBe(true)
      expect(result).toContain('Unknown tool')
    })

    it('returns error for invalid JSON args', async () => {
      const routes = {
        test: vi.fn().mockResolvedValue('ok'),
      }
      const { result, error } = await executeToolCall(routes, 'test', '{invalid json')
      expect(error).toBe(true)
      expect(result).toContain('Invalid JSON')
    })

    it('calls the handler and returns stringified result', async () => {
      const routes = {
        test: vi.fn().mockResolvedValue({ status: 'ok', data: 42 }),
      }
      const { result, error } = await executeToolCall(routes, 'test', '{"a": 1}')
      expect(error).toBe(false)
      expect(routes.test).toHaveBeenCalledWith({ a: 1 })
      expect(result).toContain('"status": "ok"')
    })

    it('returns string results directly', async () => {
      const routes = {
        test: vi.fn().mockResolvedValue('hello world'),
      }
      const { result, error } = await executeToolCall(routes, 'test', '{}')
      expect(error).toBe(false)
      expect(result).toBe('hello world')
    })

    it('catches exceptions and returns error result', async () => {
      const routes = {
        test: vi.fn().mockRejectedValue(new Error('boom')),
      }
      const { result, error } = await executeToolCall(routes, 'test', '{}')
      expect(error).toBe(true)
      expect(result).toContain('boom')
    })

    it('truncates very large results', async () => {
      const largeResult = 'x'.repeat(60_000)
      const routes = {
        test: vi.fn().mockResolvedValue(largeResult),
      }
      const { result, error } = await executeToolCall(routes, 'test', '{}')
      expect(error).toBe(false)
      expect(result.length).toBeLessThan(60_000)
      expect(result).toContain('characters omitted')
    })
  })
})
