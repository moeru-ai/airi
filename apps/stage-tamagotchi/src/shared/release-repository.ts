/** Build-time release routing. Upstream builds retain their existing repository. */
export function resolveReleaseRepository(value?: string) {
  const repository = value?.trim() || 'moeru-ai/airi'
  if (!/^[\w-]+\/[\w.-]+$/.test(repository) || repository.split('/').some(part => part === '.' || part === '..'))
    throw new Error('AIRI_RELEASE_REPOSITORY must contain a GitHub owner/repository')
  return repository
}

export function releaseRepositoryEndpoints(value?: string) {
  const repository = resolveReleaseRepository(value)
  const base = `https://github.com/${repository}/releases`
  return {
    api: `https://api.github.com/repos/${repository}/releases?per_page=100`,
    atom: `${base}.atom`,
    download: `${base}/download`,
    tagMarker: `/${repository}/releases/tag/`,
  }
}
