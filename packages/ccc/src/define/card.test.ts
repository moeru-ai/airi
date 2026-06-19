import { describe, expect, it } from 'vitest'
import { defineCard, defineCardFn } from './card'
import type { Card, CardFn } from './card'

const validCard: Card = {
  name: 'Test Character',
  version: '1.0',
}

describe('defineCard', () => {
  it('returns the input card object as-is', () => {
    const result = defineCard(validCard)

    expect(result).toBe(validCard)
  })

  it('preserves all card properties', () => {
    const card: Card = {
      name: 'Airi',
      version: '2.0',
      nickname: 'ai',
      description: 'An AI companion',
      personality: 'cheerful',
      scenario: 'space station',
      systemPrompt: 'You are Airi.',
      postHistoryInstructions: 'Stay in character.',
      tags: ['ai', 'companion'],
      greetings: ['Hello!'],
      greetingsGroupOnly: ['Hey everyone!'],
      notes: 'A test card',
      metadata: { avatar: 'https://example.com/avatar.png', level: 5 },
    }

    const result = defineCard(card)

    expect(result.name).toBe('Airi')
    expect(result.version).toBe('2.0')
    expect(result.nickname).toBe('ai')
    expect(result.description).toBe('An AI companion')
    expect(result.personality).toBe('cheerful')
    expect(result.scenario).toBe('space station')
    expect(result.systemPrompt).toBe('You are Airi.')
    expect(result.postHistoryInstructions).toBe('Stay in character.')
    expect(result.tags).toEqual(['ai', 'companion'])
    expect(result.greetings).toEqual(['Hello!'])
    expect(result.greetingsGroupOnly).toEqual(['Hey everyone!'])
    expect(result.notes).toBe('A test card')
    expect(result.metadata).toEqual({ avatar: 'https://example.com/avatar.png', level: 5 })
  })
})

describe('defineCardFn', () => {
  it('calls the card function with the provided data', () => {
    const cardFn: CardFn<{ theme: string }> = (data) => ({
      name: 'Themed Character',
      version: '1.0',
      personality: data.theme,
    })

    const result = defineCardFn(cardFn, { theme: 'dark' })

    expect(result.name).toBe('Themed Character')
    expect(result.version).toBe('1.0')
    expect(result.personality).toBe('dark')
  })

  it('preserves the returned card shape', () => {
    const cardFn: CardFn<{ role: string; level: number }> = (data) => ({
      name: 'Scoped Character',
      version: '3.0',
      personality: data.role,
      metadata: { level: data.level },
    })

    const result = defineCardFn(cardFn, { role: 'guardian', level: 42 })

    expect(result.name).toBe('Scoped Character')
    expect(result.version).toBe('3.0')
    expect(result.personality).toBe('guardian')
    expect(result.metadata).toEqual({ level: 42 })
  })

  it('works with default generic parameter', () => {
    const cardFn: CardFn = () => ({
      name: 'Default Character',
      version: '1.0',
    })

    const result = defineCardFn(cardFn, {})

    expect(result.name).toBe('Default Character')
    expect(result.version).toBe('1.0')
  })
})
