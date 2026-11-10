import { expect, it } from 'vitest'

import { renderConversationPreview } from './preview'
import { readTurns } from './turns'

it('describes media in messages and tool results without exposing their payloads', () => {
  const preview = renderConversationPreview({ turns: readTurns([
    { id: 'user', role: 'user', segments: [{ type: 'image', url: 'data:image/png;base64,private-image' }, { type: 'audio', data: 'private-audio', format: 'wav' }] },
    { id: 'call', role: 'assistant', segments: [{ type: 'tool-call', callId: 'call', name: 'lookup', arguments: '{}' }] },
    { id: 'tool', role: 'tool', segments: [{ type: 'tool-result', callId: 'call', content: [{ type: 'text', text: 'Result: ' }, { type: 'image', url: 'private-tool-image' }, { type: 'file', data: 'private-file', name: 'report.pdf' }] }] },
  ]) })
  expect(preview).toEqual([{ role: 'user', content: '[Image][Audio]' }, { role: 'assistant', content: 'lookup({}): Result: [Image][File: report.pdf]' }])
  expect(JSON.stringify(preview)).not.toContain('private-')
})
