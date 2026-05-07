import { describe, expect, it } from 'vitest'

import { selectDesktopOverlaySmokeCandidateId } from './desktop-overlay-live-window-smoke'

describe('selectDesktopOverlaySmokeCandidateId', () => {
  it('prefers the smoke button label', () => {
    const candidateId = selectDesktopOverlaySmokeCandidateId({
      lastGroundingSnapshot: {
        targetCandidates: [
          { id: 'first', label: 'Something else', role: 'link' },
          { id: 'smoke', label: 'AIRI Desktop Overlay Smoke Button', role: 'button' },
        ],
      },
    })

    expect(candidateId).toBe('smoke')
  })

  it('falls back to a button role', () => {
    const candidateId = selectDesktopOverlaySmokeCandidateId({
      lastGroundingSnapshot: {
        targetCandidates: [
          { id: 'plain', label: 'Something else', role: 'text' },
          { id: 'buttonish', label: 'Not the smoke label', role: 'Button' },
        ],
      },
    })

    expect(candidateId).toBe('buttonish')
  })

  it('falls back to the first candidate when no better match exists', () => {
    const candidateId = selectDesktopOverlaySmokeCandidateId({
      lastGroundingSnapshot: {
        targetCandidates: [
          { id: 'first', label: 'Alpha', role: 'link' },
          { id: 'second', label: 'Beta', role: 'text' },
        ],
      },
    })

    expect(candidateId).toBe('first')
  })

  it('throws when no candidate ids exist', () => {
    expect(() => {
      selectDesktopOverlaySmokeCandidateId({
        lastGroundingSnapshot: {
          targetCandidates: [{ label: 'Missing id', role: 'button' }],
        },
      })
    }).toThrow('desktop_observe produced no clickable target candidate id')
  })
})
