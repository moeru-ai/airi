import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  net: { fetch: fetchMock },
}))

describe('changesUrlOf', () => {
  it.each([
    { name: 'a release', current: '0.14.2-dev.945.3e83efd', target: '0.15.0', expected: 'https://github.com/moeru-ai/airi/releases/tag/v0.15.0' },
    { name: 'a prerelease', current: '0.13.0', target: '0.14.0-rc.1', expected: 'https://github.com/moeru-ai/airi/releases/tag/v0.14.0-rc.1' },
    { name: 'a dev build', current: '0.13.1-dev.821.13eef81', target: '0.13.1-dev.830.4b5c6d7', expected: 'https://github.com/moeru-ai/airi/compare/13eef81...4b5c6d7' },
    { name: 'a nightly build after a release', current: '0.15.0', target: '0.15.1-nightly.3.9f8e7d6', expected: 'https://github.com/moeru-ai/airi/compare/v0.15.0...9f8e7d6' },
  ])('links $name', async ({ current, target, expected }) => {
    const { changesUrlOf } = await import('./release-notes')

    expect(changesUrlOf(current, target)).toBe(expected)
  })
})

describe('fetchGitHubReleaseNotes', () => {
  beforeEach(() => {
    fetchMock.mockReset()
  })

  it('reads the notes of the release tag', async () => {
    fetchMock.mockResolvedValue(Response.json({ body: '## v0.15.0 Highlights\n' }))
    const { fetchGitHubReleaseNotes } = await import('./release-notes')

    await expect(fetchGitHubReleaseNotes('0.15.0')).resolves.toBe('## v0.15.0 Highlights')
    expect(fetchMock).toHaveBeenCalledWith('https://api.github.com/repos/moeru-ai/airi/releases/tags/v0.15.0', expect.anything())
  })

  it('returns nothing for a release without notes', async () => {
    fetchMock.mockResolvedValue(Response.json({ body: null }))
    const { fetchGitHubReleaseNotes } = await import('./release-notes')

    await expect(fetchGitHubReleaseNotes('0.15.0')).resolves.toBeUndefined()
  })

  it('fails when GitHub has no release', async () => {
    fetchMock.mockResolvedValue(Response.json({ message: 'Not Found' }, { status: 404 }))
    const { fetchGitHubReleaseNotes } = await import('./release-notes')

    await expect(fetchGitHubReleaseNotes('0.15.0')).rejects.toThrow('404')
  })
})
