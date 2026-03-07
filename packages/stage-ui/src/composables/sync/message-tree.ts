/**
 * Message tree builder for handling conversation branches.
 *
 * When two devices chat with AI offline and then sync, the conversation
 * forms a tree (DAG) instead of a linear list. This module builds the
 * tree and provides utilities to navigate branches.
 *
 * Example:
 *   msg-1 ── msg-2 ─┬── msg-3a ── msg-4a   (branch 0)
 *                    └── msg-3b ── msg-4b   (branch 1)
 */

export interface TreeMessage {
  id: string
  parentId?: string | null
  [key: string]: unknown
}

export interface MessageNode<T extends TreeMessage = TreeMessage> {
  message: T
  children: MessageNode<T>[]
}

/**
 * Build a message tree from a flat list of messages.
 * Returns the root nodes (messages without parentId or whose parent is not in the list).
 */
export function buildMessageTree<T extends TreeMessage>(messages: T[]): MessageNode<T>[] {
  if (messages.length === 0)
    return []

  const nodeMap = new Map<string, MessageNode<T>>()
  const roots: MessageNode<T>[] = []

  // Create nodes
  for (const msg of messages) {
    nodeMap.set(msg.id, { message: msg, children: [] })
  }

  // Build tree
  for (const msg of messages) {
    const node = nodeMap.get(msg.id)!
    if (msg.parentId && nodeMap.has(msg.parentId)) {
      nodeMap.get(msg.parentId)!.children.push(node)
    }
    else {
      roots.push(node)
    }
  }

  return roots
}

/**
 * A fork point is where a parent has multiple children.
 */
export interface ForkPoint {
  parentId: string
  branchCount: number
}

/**
 * Find all fork points in the tree (nodes with ≥2 children).
 */
export function findForkPoints<T extends TreeMessage>(roots: MessageNode<T>[]): ForkPoint[] {
  const forks: ForkPoint[] = []

  function walk(node: MessageNode<T>) {
    if (node.children.length >= 2) {
      forks.push({
        parentId: node.message.id,
        branchCount: node.children.length,
      })
    }
    for (const child of node.children) {
      walk(child)
    }
  }

  for (const root of roots) {
    walk(root)
  }

  return forks
}

/**
 * Get a linear branch from the tree by following selected branch indices at each fork.
 *
 * @param roots - The root nodes of the message tree
 * @param selectedBranches - Map of parentId → selected child index (0-based)
 * @returns Linear list of messages for the selected branch path
 */
export function getLinearBranch<T extends TreeMessage>(
  roots: MessageNode<T>[],
  selectedBranches: Record<string, number> = {},
): T[] {
  const result: T[] = []

  function walk(nodes: MessageNode<T>[]) {
    if (nodes.length === 0)
      return

    // If there's only one path, follow it
    if (nodes.length === 1) {
      result.push(nodes[0].message)
      walk(nodes[0].children)
      return
    }

    // Multiple nodes at this level (roots or siblings)
    // This shouldn't normally happen at root level for a well-formed tree
    // But handle it gracefully by picking the first
    const node = nodes[0]
    result.push(node.message)
    walk(node.children)
  }

  function walkNode(node: MessageNode<T>) {
    result.push(node.message)

    if (node.children.length === 0)
      return

    if (node.children.length === 1) {
      walkNode(node.children[0])
      return
    }

    // Fork point: pick the selected branch
    const selectedIndex = selectedBranches[node.message.id] ?? 0
    const clampedIndex = Math.min(selectedIndex, node.children.length - 1)
    walkNode(node.children[clampedIndex])
  }

  // Start from roots
  if (roots.length === 1) {
    walkNode(roots[0])
  }
  else if (roots.length > 1) {
    // Multiple roots: pick first, walk it
    walkNode(roots[0])
  }

  return result
}

/**
 * Get branch info at a specific fork point.
 * Returns the children messages and which one is currently selected.
 */
export function getBranchInfo<T extends TreeMessage>(
  roots: MessageNode<T>[],
  forkParentId: string,
  selectedBranches: Record<string, number> = {},
): { branches: T[], selectedIndex: number } | null {
  function findNode(node: MessageNode<T>): MessageNode<T> | null {
    if (node.message.id === forkParentId)
      return node
    for (const child of node.children) {
      const found = findNode(child)
      if (found)
        return found
    }
    return null
  }

  for (const root of roots) {
    const forkNode = findNode(root)
    if (forkNode && forkNode.children.length >= 2) {
      const selectedIndex = selectedBranches[forkParentId] ?? 0
      return {
        branches: forkNode.children.map(c => c.message),
        selectedIndex: Math.min(selectedIndex, forkNode.children.length - 1),
      }
    }
  }

  return null
}
