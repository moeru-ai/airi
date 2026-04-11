import type { JsonSchema } from 'xsschema'

import { describe, expect, it } from 'vitest'

import { mcp } from './mcp'

describe('tools mcp schema', () => {
  it('emits strict parameter objects', async () => {
    const tools = await mcp()
    for (const name of ['builtIn_mcpListTools', 'builtIn_mcpCallTool']) {
      const t = tools.find(entry => entry.function.name === name)
      expect(t, `missing tool: ${name}`).toBeDefined()
      expect(t?.function.parameters.additionalProperties).toBe(false)
    }
  })

  it('builtIn_mcpCallTool uses flat name+arguments schema', async () => {
    const tools = await mcp()
    const callTool = tools.find(entry => entry.function.name === 'builtIn_mcpCallTool')
    expect(callTool).toBeDefined()

    const props = (callTool!.function.parameters as JsonSchema).properties!
    expect((props.name as JsonSchema).type).toBe('string')
    expect((props.arguments as JsonSchema).type).toBe('string')
  })

  it('describes MCP tools as optional and need-based', async () => {
    const tools = await mcp()
    const listTool = tools.find(entry => entry.function.name === 'builtIn_mcpListTools')
    const callTool = tools.find(entry => entry.function.name === 'builtIn_mcpCallTool')

    expect(listTool?.function.description).toContain('only when the request truly needs external capabilities')
    expect(listTool?.function.description).toContain('Do not call this for greetings, small talk')
    expect(callTool?.function.description).toContain('only after deciding a tool is actually necessary')
    expect(callTool?.function.description).toContain('Do not call this for ordinary conversation')
  })
})
