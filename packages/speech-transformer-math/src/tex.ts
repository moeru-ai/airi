/**
 * A node of the syntax tree that lowering reads. ./parse builds it from the KaTeX parse tree.
 *
 * It keeps only the structure that changes the spoken order: groups, scripts, fractions, roots, delimiters, and the
 * commands whose argument is not math, for example `\text` and `\ce`. Every other command is a symbol, so an unknown
 * command is read by its name and does not fail.
 */
export type TexNode
  = | { readonly type: 'symbol', readonly value: string }
    | { readonly type: 'group', readonly children: TexNode[] }
    | { readonly type: 'scripts', readonly base: TexNode, sub?: TexNode[], sup?: TexNode[] }
    | { readonly type: 'command', readonly name: string, readonly args: TexNode[][], readonly option?: TexNode[] }
    | { readonly type: 'text', readonly name: string, readonly value: string }
    /** A command that an extension reads from its source, as `\ce{H2O}`. */
    | { readonly type: 'raw', readonly command: string, readonly value: string }
    | { readonly type: 'fence', readonly open: string, readonly close: string, readonly children: TexNode[], sub?: TexNode[], sup?: TexNode[] }
    | { readonly type: 'rows', readonly name: string, readonly rows: TexNode[][] }

const fences: Record<string, string> = { '(': ')', '[': ']', '\\{': '\\}', '\\lbrace': '\\rbrace', '\\langle': '\\rangle', '|': '|', '\\vert': '\\vert', '\\|': '\\|', '\\lvert': '\\rvert', '\\Vert': '\\Vert', '\\lVert': '\\rVert', '‖': '‖', '\\lceil': '\\rceil', '\\lfloor': '\\rfloor', '⌈': '⌉', '⌊': '⌋' }

/** An interval mixes parentheses and brackets, for example `[0, 1)`, so either one closes the other. */
function closes(open: string, close: string): boolean {
  if (fences[open] === close)
    return true
  return (open === '(' || open === '[') && (close === ')' || close === ']')
}

/** Symbols after which a bar opens an absolute value or a norm, instead of closing one. */
const opensAfter = new Set(['+', '-', '=', '<', '>', ',', '\\times', '\\pm', '\\leq', '\\geq', '\\neq', '\\approx', '/'])

/**
 * Pairs delimiters into fence nodes, so `(a+b)^2` squares the whole group and `|x|` is one absolute value.
 * A script on the closing delimiter moves to the fence.
 */
export function fence(nodes: TexNode[]): TexNode[] {
  const result: TexNode[] = []
  const stack: { open: string, start: number }[] = []

  for (const node of nodes.map(deepFence)) {
    const value = node.type === 'symbol' ? node.value : node.type === 'scripts' && node.base.type === 'symbol' ? node.base.value : undefined
    const top = stack.at(-1)
    // A bar after an operator or right after another opening bar opens a new pair, as the inner bars of `|x - |y||`.
    const before = result.at(-1)
    const opensInner = value !== undefined && top !== undefined && fences[value] === value && top.open === value
      && (result.length === top.start + 1 || (before?.type === 'symbol' && opensAfter.has(before.value)))
    if (value !== undefined && top && closes(top.open, value) && !opensInner) {
      stack.pop()
      const children = result.splice(top.start)
      children.shift()
      const fenced: TexNode = { type: 'fence', open: top.open, close: value, children }
      if (node.type === 'scripts') {
        fenced.sub = node.sub
        fenced.sup = node.sup
      }
      result.push(fenced)
      continue
    }
    if (node.type === 'symbol' && fences[node.value] !== undefined)
      stack.push({ open: node.value, start: result.length })
    result.push(node)
  }
  return result
}

function deepFence(node: TexNode): TexNode {
  switch (node.type) {
    case 'group':
      return { ...node, children: fence(node.children) }
    case 'scripts':
      return { ...node, base: deepFence(node.base), sub: node.sub && fence(node.sub), sup: node.sup && fence(node.sup) }
    case 'command':
      return { ...node, args: node.args.map(fence), option: node.option && fence(node.option) }
    case 'rows':
      return { ...node, rows: node.rows.map(fence) }
    default:
      return node
  }
}

/** Lists the command names in a source, for example to check them against what a provider supports. */
export function texCommands(source: string): string[] {
  return [...source.matchAll(/\\([a-z]+|.)/gi)].map(match => match[1]!)
}
