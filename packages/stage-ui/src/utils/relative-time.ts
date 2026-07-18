export function formatRelativeTime(timestamp: number, now: number) {
  const diffMs = Math.max(0, now - timestamp)
  const diffSeconds = Math.floor(diffMs / 1000)

  if (diffSeconds < 60)
    return `${diffSeconds} ${diffSeconds === 1 ? 'second' : 'seconds'} ago`

  return 'Stale'
}
