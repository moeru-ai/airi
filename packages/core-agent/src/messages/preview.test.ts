import { expect, it } from 'vitest'

import { renderConversationPreview } from './preview'

it('describes media in messages and tool results without exposing their payloads', () => {
  const preview = renderConversationPreview({ turns: [{ messages: [
    { id: 'user', role: 'user', segments: [{ type: 'image', url: 'data:image/png;base64,private-image' }, { type: 'audio', data: 'private-audio', format: 'wav' }] },
    { id: 'tool', role: 'tool', segments: [{ type: 'tool-result', callId: 'call', content: [{ type: 'text', text: 'Result: ' }, { type: 'image', url: 'private-tool-image' }, { type: 'file', data: 'private-file', name: 'report.pdf' }] }] },
  ] }] })
  expect(preview).toEqual([{ role: 'user', content: '[Image][Audio]' }, { role: 'user', content: 'Result: [Image][File: report.pdf]' }])
  expect(JSON.stringify(preview)).not.toContain('private-')
})
