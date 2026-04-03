export function captureRootSelector(rootName: string): string {
  return `[data-scenario-capture-root=${JSON.stringify(rootName)}]`
}
