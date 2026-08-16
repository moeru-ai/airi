/** Query key that identifies an Electron renderer window. */
export const rendererWindowQueryKey = 'window'

/** Window types that use the shared Stage renderer entrypoint. */
export const rendererWindowTypes = [
  'about',
  'caption',
  'chat',
  'dashboard',
  'desktop-overlay',
  'devtools',
  'editor',
  'inlay',
  'main',
  'notice',
  'onboarding',
  'settings',
  'spotlight',
  'widgets',
] as const

/** Identifies the Electron window that owns a renderer instance. */
export type RendererWindowType = typeof rendererWindowTypes[number]

const rendererWindowTypeSet: ReadonlySet<string> = new Set(rendererWindowTypes)

/** Returns whether a query value identifies a known renderer window. */
export function isRendererWindowType(value: string | null): value is RendererWindowType {
  return value !== null && rendererWindowTypeSet.has(value)
}
