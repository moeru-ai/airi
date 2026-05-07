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

  it('fails when the smoke label is missing', () => {
    expect(() => {
      selectDesktopOverlaySmokeCandidateId({
        lastGroundingSnapshot: {
          targetCandidates: [
            { id: 'first', label: 'Alpha', role: 'link' },
            { id: 'second', label: 'Beta', role: 'button' },
          ],
        },
      })
    }).toThrow('desktop_observe did not return the AIRI Desktop Overlay Smoke Button chrome_dom candidate')
  })

  it('throws when no candidate ids exist', () => {
    expect(() => {
      selectDesktopOverlaySmokeCandidateId({
        lastGroundingSnapshot: {
          targetCandidates: [{ label: 'Missing id', role: 'button' }],
        },
      })
    }).toThrow('desktop_observe did not return the AIRI Desktop Overlay Smoke Button chrome_dom candidate')
  })
})
