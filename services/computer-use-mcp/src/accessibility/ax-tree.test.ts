import type { AXNode, AXSnapshot } from '../accessibility/types'

import { describe, expect, it } from 'vitest'

import { findAXNodeByUid, formatAXSnapshotAsText } from '../accessibility/ax-tree'

function createTestSnapshot(overrides: Partial<AXSnapshot> = {}): AXSnapshot {
  const root: AXNode = {
    children: [
      {
        children: [
          {
            bounds: { height: 30, width: 80, x: 100, y: 200 },
            children: [],
            role: 'AXButton',
            title: 'OK',
            uid: '1_2',
          },
          {
            children: [],
            focused: true,
            role: 'AXTextField',
            title: 'Name',
            uid: '1_3',
            value: 'Hello World',
          },
          {
            children: [],
            enabled: false,
            role: 'AXButton',
            title: 'Cancel',
            uid: '1_4',
          },
        ],
        role: 'AXWindow',
        title: 'Main Window',
        uid: '1_1',
      },
    ],
    role: 'AXApplication',
    title: 'TestApp',
    uid: '1_0',
  }

  const uidToNode = new Map<string, AXNode>()
  function index(node: AXNode) {
    uidToNode.set(node.uid, node)
    for (const child of node.children) {
      index(child)
    }
  }
  index(root)

  return {
    appName: 'TestApp',
    capturedAt: '2025-01-01T00:00:00.000Z',
    maxDepth: 15,
    pid: 1234,
    root,
    snapshotId: '1',
    truncated: false,
    uidToNode,
    ...overrides,
  }
}

describe('formatAXSnapshotAsText', () => {
  it('formats a basic tree with uids', () => {
    const snapshot = createTestSnapshot()
    const text = formatAXSnapshotAsText(snapshot)

    expect(text).toContain('[AXTree] TestApp (pid 1234)')
    expect(text).toContain('[1_0] AXApplication "TestApp"')
    expect(text).toContain('[1_2] AXButton "OK"')
    expect(text).toContain('[1_3] AXTextField "Name" val="Hello World" [focused]')
    expect(text).toContain('[1_4] AXButton "Cancel" [disabled]')
  })

  it('includes bounds when requested', () => {
    const snapshot = createTestSnapshot()
    const text = formatAXSnapshotAsText(snapshot, { includeBounds: true })

    expect(text).toContain('@(100,200 80x30)')
  })

  it('omits uids when requested', () => {
    const snapshot = createTestSnapshot()
    const text = formatAXSnapshotAsText(snapshot, { includeUids: false })

    expect(text).not.toContain('[1_0]')
    expect(text).toContain('AXApplication "TestApp"')
  })

  it('marks truncated snapshots', () => {
    const snapshot = createTestSnapshot({ truncated: true })
    const text = formatAXSnapshotAsText(snapshot)

    expect(text).toContain('[TRUNCATED]')
  })

  it('truncates long values', () => {
    const root: AXNode = {
      children: [],
      role: 'AXStaticText',
      uid: '1_0',
      value: 'A'.repeat(200),
    }
    const uidToNode = new Map<string, AXNode>([['1_0', root]])
    const snapshot: AXSnapshot = {
      appName: 'Test',
      capturedAt: '2025-01-01T00:00:00.000Z',
      maxDepth: 15,
      pid: 1,
      root,
      snapshotId: '1',
      truncated: false,
      uidToNode,
    }
    const text = formatAXSnapshotAsText(snapshot)

    expect(text).toContain('...')
    // Value should be truncated to 80 chars
    expect(text).not.toContain('A'.repeat(200))
  })
})

describe('findAXNodeByUid', () => {
  it('finds a node by uid', () => {
    const snapshot = createTestSnapshot()
    const node = findAXNodeByUid(snapshot, '1_2')

    expect(node).toBeDefined()
    expect(node!.role).toBe('AXButton')
    expect(node!.title).toBe('OK')
  })

  it('returns undefined for non-existent uid', () => {
    const snapshot = createTestSnapshot()
    const node = findAXNodeByUid(snapshot, 'nonexistent')

    expect(node).toBeUndefined()
  })
})
