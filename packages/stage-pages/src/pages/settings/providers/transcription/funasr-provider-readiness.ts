export function isFunASRPlaygroundReady(status: string | undefined, baseUrl: string, model: string) {
  return status === 'configured' && Boolean(baseUrl && model)
}
