export function shouldBypassGlobalBodyLimit(path: string): boolean {
  return (
    path === '/api/v1/openai/audio/transcriptions'
    || path === '/api/v1/singing'
    || path.startsWith('/api/v1/singing/')
  )
}
