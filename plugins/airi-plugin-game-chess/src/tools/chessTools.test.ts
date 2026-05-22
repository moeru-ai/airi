import { describe, expect, it, vi } from 'vitest'

import { chessTools } from './chessTools'

/** Standard chess starting position. */
const STARTPOS = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

function tool(id: string) {
  const found = chessTools.find(tool => tool.id === id)
  if (!found)
    throw new Error(`Missing tool ${id}`)
  return found
}

function createCtx() {
  const request = vi.fn(async () => ({ ok: true }))
  return {
    request,
    ctx: {
      gamelets: {
        isOpen: vi.fn(() => true),
        request,
      },
    },
  }
}

/**
 * @example
 * await analyze.execute({ fen, depth: 12, multipv: 3 }, ctx)
 */
describe('chessTools', () => {
  /**
   * @example
   * expect(request).toHaveBeenCalledWith('chess', expect.objectContaining({ depth: 12 }))
   */
  it('forwards bounded analyze_position requests to the chess gamelet', async () => {
    const { ctx, request } = createCtx()
    const analyze = tool('analyze_position')

    await analyze.execute({ fen: STARTPOS, depth: 12, multipv: 3 }, ctx as any)

    expect(request).toHaveBeenCalledWith('chess', {
      type: 'analyze_position',
      fen: STARTPOS,
      depth: 12,
      multipv: 3,
    })
  })

  /**
   * @example
   * await expect(analyze.execute({ fen, depth: 99 }, ctx)).rejects.toThrow()
   */
  it('rejects analyze_position depth and multipv values outside browser-safe bounds', async () => {
    const { ctx, request } = createCtx()
    const analyze = tool('analyze_position')

    await expect(analyze.execute({ fen: STARTPOS, depth: 0 }, ctx as any)).rejects.toThrow()
    await expect(analyze.execute({ fen: STARTPOS, depth: 21 }, ctx as any)).rejects.toThrow()
    await expect(analyze.execute({ fen: STARTPOS, depth: 12.5 }, ctx as any)).rejects.toThrow()
    await expect(analyze.execute({ fen: STARTPOS, multipv: 0 }, ctx as any)).rejects.toThrow()
    await expect(analyze.execute({ fen: STARTPOS, multipv: 6 }, ctx as any)).rejects.toThrow()

    expect(request).not.toHaveBeenCalled()
  })
})
