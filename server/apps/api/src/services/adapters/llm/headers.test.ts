import { describe, expect, it } from 'vitest'

import { upstreamHeaders } from './headers'

describe('upstreamHeaders', () => {
  it('uses the Authorization header from the list and replaces {KEY} with the attempt key', () => {
    expect(upstreamHeaders({ headerTemplate: 'Bearer {KEY}', headers: { 'Authorization': 'Token {KEY}', 'X-Title': 'AIRI' } }, 'sk-1'))
      .toEqual({ 'Authorization': 'Token sk-1', 'X-Title': 'AIRI' })
  })

  it('matches Authorization without regard to case and then ignores headerTemplate', () => {
    expect(upstreamHeaders({ headerTemplate: 'Bearer {KEY}', headers: { AUTHORIZATION: 'Bearer {KEY}' } }, 'sk-1'))
      .toEqual({ AUTHORIZATION: 'Bearer sk-1' })
  })

  it('replaces {KEY} in any header value, every time it appears', () => {
    expect(upstreamHeaders({ headerTemplate: 'Bearer {KEY}', headers: { 'Authorization': 'Bearer {KEY}', 'x-pair': '{KEY}:{KEY}' } }, 'sk-1'))
      .toEqual({ 'Authorization': 'Bearer sk-1', 'x-pair': 'sk-1:sk-1' })
  })

  // The admin catalog lets an upstream send its key in another header (for example api-key) and drop Authorization.
  it('adds no Authorization when another header already carries {KEY}', () => {
    expect(upstreamHeaders({ headerTemplate: 'Bearer {KEY}', headers: { 'api-key': '{KEY}', 'X-Title': 'AIRI' } }, 'sk-1'))
      .toEqual({ 'api-key': 'sk-1', 'X-Title': 'AIRI' })
  })

  it('falls back to headerTemplate when the list has no Authorization header', () => {
    expect(upstreamHeaders({ headerTemplate: 'Bearer {KEY}', headers: { 'HTTP-Referer': 'https://airi.moeru.ai' } }, 'sk-2'))
      .toEqual({ 'HTTP-Referer': 'https://airi.moeru.ai', 'authorization': 'Bearer sk-2' })
  })

  it('keeps the old behavior when there are no headers', () => {
    expect(upstreamHeaders({ headerTemplate: 'Bearer {KEY}', headers: {} }, 'sk-3')).toEqual({ authorization: 'Bearer sk-3' })
  })

  // The config schema rejects content-type. This is a second guard so the adapter's JSON content type always wins.
  it('drops content-type in any case', () => {
    expect(upstreamHeaders({ headerTemplate: 'Bearer {KEY}', headers: { 'Content-Type': 'text/plain' } }, 'sk-1'))
      .toEqual({ authorization: 'Bearer sk-1' })
  })
})
