function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function selectDesktopOverlaySmokeCandidateId(runState: Record<string, unknown>): string {
  const snapshot = runState.lastGroundingSnapshot
  if (!isRecord(snapshot))
    throw new Error('desktop_get_state missing lastGroundingSnapshot after desktop_observe')

  const candidates = Array.isArray(snapshot.targetCandidates)
    ? snapshot.targetCandidates.filter(isRecord)
    : []

  const selected = candidates.find((candidate) => {
    return candidate.source === 'chrome_dom'
      && String(candidate.label || '').includes('AIRI Desktop Overlay Smoke Button')
  })

  const id = typeof selected?.id === 'string' ? selected.id : ''
  if (!id)
    throw new Error('desktop_observe did not return the AIRI Desktop Overlay Smoke Button chrome_dom candidate')

  return id
}
