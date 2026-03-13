import type { MultiDisplaySnapshot } from './types'

export async function enumerateDisplays(_: unknown): Promise<MultiDisplaySnapshot> {
  throw new Error('Display enumeration adapter moved to Chunk 5 (system/adapter cleanup).')
}

export function formatDisplaySummary(_: MultiDisplaySnapshot): string {
  return 'Display enumeration adapter moved to Chunk 5 (system/adapter cleanup).'
}

export { findDisplayForPoint, toDisplayLocalCoord, toGlobalCoord } from './types'
export type { DisplayDescriptor, MultiDisplaySnapshot } from './types'
