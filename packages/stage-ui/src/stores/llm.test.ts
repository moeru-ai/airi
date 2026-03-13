import { afterEach, describe, expect, it } from 'vitest'

import { resolveBuiltinChatTools, shouldUseManualToolLoop } from './llm'
import { clearMcpToolBridge } from './mcp-tool-bridge'

afterEach(() => {
  clearMcpToolBridge()
})

describe('shouldUseManualToolLoop', () => {
  it('enables the manual loop for GitHub Models', () => {
    expect(shouldUseManualToolLoop('https://models.github.ai/inference')).toBe(true)
  })

  it('enables the manual loop for Google Generative Language OpenAI compatibility endpoints', () => {
    expect(shouldUseManualToolLoop('https://generativelanguage.googleapis.com/v1beta/openai/')).toBe(true)
  })

  it('does not enable the manual loop for standard OpenAI endpoints', () => {
    expect(shouldUseManualToolLoop('https://api.openai.com/v1/')).toBe(false)
  })
})

describe('resolveBuiltinChatTools', () => {
  it('returns MCP bridge tools', async () => {
    const tools = await resolveBuiltinChatTools({ promptContentMode: 'default' })
    const names = tools.map(tool => tool.function.name)

    expect(names).toContain('mcp_list_tools')
    expect(names).toContain('mcp_call_tool')
  })
})
