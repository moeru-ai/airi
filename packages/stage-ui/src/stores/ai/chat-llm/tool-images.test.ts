import type { Tool, ToolExecuteResult } from '@xsai/shared-chat'

import { describe, expect, it, vi } from 'vitest'

import { withDescribedImages } from './tool-images'

function toolReturning(result: ToolExecuteResult): Tool {
  return {
    type: 'function',
    function: { name: 'computer_use_read_image', parameters: {} },
    execute: async () => result,
  }
}

async function run(tool: Tool, abortSignal?: AbortSignal) {
  return await tool.execute({}, { abortSignal, messages: [], toolCallId: 'call-1' })
}

describe('withDescribedImages', () => {
  // ROOT CAUSE:
  //
  // A tool returned a screenshot to a chat model that cannot see images. The
  // vision model only read user attachments, so the full image reached the
  // chat provider, which rejected it as too large.
  it('replaces an image_url part with its description', async () => {
    const describe = vi.fn(async () => 'A settings window with a Save button.')
    const tool = withDescribedImages(toolReturning([
      { type: 'image_url', image_url: { url: 'data:image/png;base64,aW1hZ2U=' } },
    ]), describe)

    expect(await run(tool)).toEqual([{
      type: 'text',
      text: '[Image description from the vision model]\nA settings window with a Save button.\n[End image description]',
    }])
    expect(describe).toHaveBeenCalledWith('data:image/png;base64,aW1hZ2U=')
  })

  it('replaces MCP image content and keeps the other fields', async () => {
    const describe = vi.fn(async () => 'A terminal.')
    const tool = withDescribedImages(toolReturning({
      content: [{ type: 'text', text: 'Captured.' }, { type: 'image', data: 'aW1hZ2U=', mimeType: 'image/jpeg' }],
      isError: false,
    }), describe)

    expect(await run(tool)).toEqual({
      content: [
        { type: 'text', text: 'Captured.' },
        { type: 'text', text: '[Image description from the vision model]\nA terminal.\n[End image description]' },
      ],
      isError: false,
    })
    expect(describe).toHaveBeenCalledWith('data:image/jpeg;base64,aW1hZ2U=')
  })

  it('reports an unreadable image without the error text', async () => {
    const tool = withDescribedImages(toolReturning([
      { type: 'image_url', image_url: { url: 'data:image/png;base64,aW1hZ2U=' } },
    ]), async () => {
      throw new Error('Vision inference timed out after 60000ms')
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(await run(tool)).toEqual([{ type: 'text', text: 'The vision model failed to read this image.' }])
  })

  it('stops when the send is cancelled', async () => {
    const controller = new AbortController()
    const tool = withDescribedImages(toolReturning([
      { type: 'image_url', image_url: { url: 'data:image/png;base64,aW1hZ2U=' } },
    ]), async () => {
      controller.abort(new Error('Cancelled'))
      throw new Error('Vision inference aborted')
    })

    await expect(run(tool, controller.signal)).rejects.toThrow('Cancelled')
  })

  it('returns a result without images unchanged', async () => {
    const describe = vi.fn()
    const tool = withDescribedImages(toolReturning('{"exitCode":0}'), describe)

    expect(await run(tool)).toBe('{"exitCode":0}')
    expect(describe).not.toHaveBeenCalled()
  })
})
