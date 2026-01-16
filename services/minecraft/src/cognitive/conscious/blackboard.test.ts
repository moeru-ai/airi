import { beforeEach, describe, expect, it } from 'vitest'

import { Blackboard } from './blackboard'

describe('blackboard', () => {
  let blackboard: Blackboard

  beforeEach(() => {
    blackboard = new Blackboard()
  })

  it('should initialize with empty chat history', () => {
    expect(blackboard.chatHistory).toEqual([])
  })

  it('should add a chat message', () => {
    const msg = { sender: 'User', content: 'Hello', timestamp: Date.now() }
    blackboard.addChatMessage(msg)
    expect(blackboard.chatHistory).toHaveLength(1)
    expect(blackboard.chatHistory[0]).toEqual(msg)
  })

  it('should limit chat history to 8 messages', () => {
    for (let i = 0; i < 10; i++) {
      blackboard.addChatMessage({
        sender: 'User',
        content: `Message ${i}`,
        timestamp: Date.now() + i,
      })
    }

    expect(blackboard.chatHistory).toHaveLength(8)
    expect(blackboard.chatHistory[0].content).toBe('Message 2') // First 2 should be dropped
    expect(blackboard.chatHistory[7].content).toBe('Message 9')
  })

  it('should provide a snapshot with chat history', () => {
    const msg = { sender: 'User', content: 'Test', timestamp: 123 }
    blackboard.addChatMessage(msg)
    const snapshot = blackboard.getSnapshot()
    expect(snapshot.chatHistory).toEqual([msg])

    // Ensure snapshot is immutable regarding the internal state reference if implemented that way,
    // or at least checking it exists.
    // In implementation we did [...this._state.chatHistory] so it should be a copy.
    snapshot.chatHistory.push({ sender: 'Evil', content: 'Modification', timestamp: 0 })
    expect(blackboard.chatHistory).toHaveLength(1)
  })
  it('should initialize with default username', () => {
    expect(blackboard.selfUsername).toBe('Bot')
  })

  it('should update selfUsername via update method', () => {
    blackboard.update({ selfUsername: 'Airi' })
    expect(blackboard.selfUsername).toBe('Airi')
  })
})
