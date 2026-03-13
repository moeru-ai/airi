import type { AXNode, AXSnapshot, AXSnapshotRequest, AXSnapshotTextOptions } from './types'

export async function captureAXTree(_: unknown, __: AXSnapshotRequest = {}): Promise<AXSnapshot> {
  throw new Error('Accessibility adapter moved to Chunk 5 (system/adapter cleanup).')
}

export function findAXNodeByUid(_: AXSnapshot, __: string): AXNode | undefined {
  return undefined
}

export function formatAXSnapshotAsText(_: AXSnapshot, __: AXSnapshotTextOptions = {}): string {
  return 'Accessibility adapter moved to Chunk 5 (system/adapter cleanup).'
}

export type { AXNode, AXSnapshot, AXSnapshotRequest, AXSnapshotTextOptions } from './types'
