import { afterEach, describe, expect, it } from 'vitest'

import { clearAiriSelfNavigationBridge, setAiriSelfNavigationBridge } from '../tools/airi-self'
import { resolveBuiltinChatTools, shouldUseManualToolLoop } from './llm'
import { clearMcpToolBridge } from './mcp-tool-bridge'

afterEach(() => {
  clearAiriSelfNavigationBridge()
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
  it('does not expose AIRI self-tools when the host bridge is absent', async () => {
    const tools = await resolveBuiltinChatTools({ promptContentMode: 'default' })
    const names = tools.map(tool => tool.function.name)

    expect(names).toContain('mcp_list_tools')
    expect(names).toContain('mcp_call_tool')
    expect(names).not.toContain('airi_open_settings')
    expect(names).not.toContain('airi_open_settings_module')
    expect(names).not.toContain('airi_return_to_chat')
  })

  it('exposes AIRI self-tools once the host bridge is installed', async () => {
    setAiriSelfNavigationBridge({
      navigateTo: async (path: string) => path,
      getCurrentRoute: () => '/chat',
    })

    const tools = await resolveBuiltinChatTools({ promptContentMode: 'default' })
    const names = tools.map(tool => tool.function.name)

    expect(names).toContain('airi_open_settings')
    expect(names).toContain('airi_open_settings_module')
    expect(names).toContain('airi_return_to_chat')
  })
})
